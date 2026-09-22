import * as Schemas from "common/models/schemas";
import { SchemaType } from "common/models/schemas";
import Permission from "common/models/permissions";
import asyncHandler from "express-async-handler";
import express from "express";
import { celebrate, Joi, Segments } from "@/celebrate";
import { IRewardPunishmentOption, ISettingsMap, ISuggestionsSettings, SettingsType } from "common/models/settings";
import { dataService } from "@/services";
import { getContext } from "@/middleware/context";
import { validateRequest } from "@/middleware/permissions";
import { hasPermission } from "common/utils";
import { StatusCodes } from "http-status-codes";
import { ApiErrorResponse } from "@/errors";
import { logActivity } from "@/services/activityLogService";
import { LogCategory } from "common/models/logs";

const router = express.Router();

// A settings document is per-`type`, so its permission is derived - an unrecognised `:type` is refused
// rather than 500ing or silently bypassing auth.
function permissionFor(type: string): Permission | undefined {
    const candidate = `EDIT_SETTINGS_${type.toUpperCase()}`;
    return Object.values(Permission).includes(candidate as Permission) ? (candidate as Permission) : undefined;
}

function validateType(type: string): asserts type is SettingsType {
    if (!permissionFor(type)) {
        throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Invalid Data", `Unknown settings type "${type}"`);
    }
}

const validateSettingsPermission = validateRequest<{ type: string }, unknown, unknown, unknown>((principal, req) => {
    const permission = permissionFor(req.params.type);
    return !!permission && hasPermission(principal, permission);
});

function draftSchemaFor(type: SettingsType): SchemaType {
    switch (type) {
        case "suggestions":
            return Schemas.Settings.Suggestions.Draft;
    }
}

function validateBody<T>(schema: SchemaType, body: unknown): T {
    const { error, value } = schema.validate(body, { errors: { label: false } });
    if (error) {
        throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Validation Error", error.message);
    }
    return value as T;
}

// Blocks removing a reward/punishment option id still credited on a live suggestion - the whole PATCH
// is refused (not a partial save), naming every blocked id/label so the caller knows what to undo.
async function assertNoBlockedRemovals(current: ISuggestionsSettings | undefined, next: ISuggestionsSettings) {
    if (!current) {
        return;
    }
    const usage = await dataService.settings.suggestionRewardPunishmentUsage();

    const blocked: string[] = [];
    for (const [field, counts] of [
        ["rewardTypes", usage.rewardTypes],
        ["punishmentTypes", usage.punishmentTypes]
    ] as const) {
        const nextIds = new Set(next[field].map((option) => option.id));
        for (const option of current[field]) {
            if (!nextIds.has(option.id) && (counts[option.id] ?? 0) > 0) {
                blocked.push(`${option.label} is still used by ${counts[option.id]} suggestion(s)`);
            }
        }
    }

    if (blocked.length > 0) {
        throw new ApiErrorResponse(
            StatusCodes.CONFLICT,
            "Invalid Data",
            `${blocked.join("; ")} - clear those first`
        );
    }
}

// Order-independent - reordering a reward/punishment's own tag list isn't a change worth resyncing over.
function sameTagSet(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    const setA = new Set(a);
    return b.every((tag) => setA.has(tag));
}

// Ids present in both old and new arrays whose OWN tags actually changed - a brand-new or removed id
// never needs a resync (nothing could reference it, or assertNoBlockedRemovals already blocked it).
function changedTagIds(current: IRewardPunishmentOption[] | undefined, next: IRewardPunishmentOption[]): string[] {
    if (!current) {
        return [];
    }
    const previousTagsById = new Map(current.map((option) => [option.id, option.tags]));
    return next
        .filter((option) => {
            const previousTags = previousTagsById.get(option.id);
            return previousTags !== undefined && !sameTagSet(previousTags, option.tags);
        })
        .map((option) => option.id);
}

router.get(
    "/:type",
    validateSettingsPermission,
    celebrate({ [Segments.QUERY]: { includeUsage: Joi.boolean().default(false) } }),
    asyncHandler<{ type: string }, unknown, unknown, { includeUsage: boolean }>(async (req, res) => {
        const { type } = req.params;
        validateType(type);

        const data = await dataService.settings.getByType(type);
        if (!data) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Invalid Data", `No settings found for "${type}"`);
        }

        // The two collection-wide aggregations behind usageCount are only worth paying for when the
        // caller actually needs them (the settings modal's delete-guard).
        if (type === "suggestions" && req.query.includeUsage) {
            const suggestionsData = data as ISuggestionsSettings;
            const usage = await dataService.settings.suggestionRewardPunishmentUsage();
            res.status(StatusCodes.OK).json({
                ...suggestionsData,
                rewardTypes: suggestionsData.rewardTypes.map((option) => ({
                    ...option,
                    usageCount: usage.rewardTypes[option.id] ?? 0
                })),
                punishmentTypes: suggestionsData.punishmentTypes.map((option) => ({
                    ...option,
                    usageCount: usage.punishmentTypes[option.id] ?? 0
                }))
            });
            return;
        }

        res.status(StatusCodes.OK).json(data);
    })
);

router.patch(
    "/:type",
    validateSettingsPermission,
    asyncHandler<{ type: string }, unknown, Partial<ISettingsMap[SettingsType]>>(async (req, res) => {
        const { type } = req.params;
        validateType(type);

        const body = validateBody<ISettingsMap[SettingsType]>(draftSchemaFor(type), req.body);
        const [existingDoc] = await dataService.settings.read({ type } as never);

        if (type === "suggestions") {
            await assertNoBlockedRemovals(
                existingDoc?.data as ISuggestionsSettings | undefined,
                body as ISuggestionsSettings
            );
        }

        // Spreads the existing document first (mirrors artists.ts's PATCH) so created/createdBy survive.
        // A missing existingDoc is a defensive fallback - the migration always seeds one per type.
        const now = new Date();
        const { principal } = getContext();
        const updated = await dataService.settings.update(
            {
                ...existingDoc,
                id: existingDoc?.id ?? crypto.randomUUID(),
                type,
                data: body,
                created: existingDoc?.created ?? now,
                createdBy: existingDoc?.createdBy ?? principal.id
            } as never,
            true
        );

        await logActivity(LogCategory.SYSTEM, "settings.updated", `<principal> updated the ${type} settings`);

        // Bulk-recompute `tags` on every suggestion referencing a changed reward/punishment - skipped
        // entirely when nothing here touched tags, so an unrelated settings save stays fast.
        if (type === "suggestions") {
            const previous = existingDoc?.data as ISuggestionsSettings | undefined;
            const next = body as ISuggestionsSettings;
            const changedIds = [
                ...changedTagIds(previous?.rewardTypes, next.rewardTypes),
                ...changedTagIds(previous?.punishmentTypes, next.punishmentTypes)
            ];
            if (changedIds.length > 0) {
                await dataService.settings.resyncSuggestionTags(changedIds, next.rewardTypes, next.punishmentTypes);
            }
        }

        res.status(StatusCodes.OK).json(updated.data);
    })
);

export default router;
