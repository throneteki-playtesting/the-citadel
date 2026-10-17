import * as Schemas from "common/models/schemas";
import { SchemaType } from "common/models/schemas";
import Permission from "common/models/permissions";
import asyncHandler from "express-async-handler";
import express from "express";
import { celebrate, Joi, Segments } from "@/celebrate";
import { ISettingsMap, ISuggestionsSettings, SettingsType } from "common/models/settings";
import { changedTagIds } from "common/designGuidelines/suggestionTags";
import { dataService } from "@/services";
import { getContext } from "@/middleware/context";
import { PermissionErrorResponse, validateRequest } from "@/middleware/permissions";
import { hasPermission } from "common/utils";
import { StatusCodes } from "http-status-codes";
import { ApiErrorResponse } from "@/errors";
import { logActivity } from "@/services/activityLogService";
import { LogCategory } from "common/models/logs";

const router = express.Router();

type Access = "read" | "edit";

// Reading a settings document is for anything which draws with it, so it follows its area's own read permission;
// changing it takes the settings permission alone. An unrecognised `:type` has neither, so it's refused rather
// than 500ing or silently bypassing auth.
const SETTINGS_PERMISSIONS: Record<SettingsType, Record<Access, Permission>> = {
    suggestions: { read: Permission.READ_SUGGESTIONS, edit: Permission.EDIT_SETTINGS_SUGGESTIONS }
};

function permissionsFor(type: string) {
    return Object.hasOwn(SETTINGS_PERMISSIONS, type) ? SETTINGS_PERMISSIONS[type as SettingsType] : undefined;
}

function validateType(type: string): asserts type is SettingsType {
    if (!permissionsFor(type)) {
        throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Invalid Data", `Unknown settings type "${type}"`);
    }
}

const validateSettingsPermission = (access: Access) =>
    validateRequest<{ type: string }, unknown, unknown, unknown>((principal, req) => {
        const permission = permissionsFor(req.params.type)?.[access];
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

// Blocks removing a reward/downside option id still credited on a live suggestion - the whole PATCH
// is refused (not a partial save), naming every blocked id/label so the caller knows what to undo.
async function assertNoBlockedRemovals(current: ISuggestionsSettings | undefined, next: ISuggestionsSettings) {
    if (!current) {
        return;
    }
    const usage = await dataService.settings.suggestionRewardDownsideUsage();

    const blocked: string[] = [];
    for (const [field, counts] of [
        ["rewardOptions", usage.rewardOptions],
        ["downsideOptions", usage.downsideOptions]
    ] as const) {
        const nextIds = new Set(next[field].map((option) => option.id));
        for (const option of current[field]) {
            if (!nextIds.has(option.id) && (counts[option.id] ?? 0) > 0) {
                blocked.push(`${option.label} is still used by ${counts[option.id]} suggestion(s)`);
            }
        }
    }

    if (blocked.length > 0) {
        throw new ApiErrorResponse(StatusCodes.CONFLICT, "Invalid Data", `${blocked.join("; ")} - clear those first`);
    }
}

router.get(
    "/:type",
    validateSettingsPermission("read"),
    celebrate({ [Segments.QUERY]: { includeUsage: Joi.boolean().default(false) } }),
    asyncHandler<{ type: string }, unknown, unknown, { includeUsage: boolean }>(async (req, res) => {
        const { type } = req.params;
        validateType(type);
        // Usage counts are the settings modal's delete-guard - tooling for editing, so reading alone doesn't reach them
        if (req.query.includeUsage && !hasPermission(getContext().principal, SETTINGS_PERMISSIONS[type].edit)) {
            throw new PermissionErrorResponse();
        }

        const data = await dataService.settings.getByType(type);
        if (!data) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Invalid Data", `No settings found for "${type}"`);
        }

        // The two collection-wide aggregations behind usageCount are only worth paying for when the
        // caller actually needs them (the settings modal's delete-guard).
        if (type === "suggestions" && req.query.includeUsage) {
            const suggestionsData = data as ISuggestionsSettings;
            const usage = await dataService.settings.suggestionRewardDownsideUsage();
            res.status(StatusCodes.OK).json({
                ...suggestionsData,
                rewardOptions: suggestionsData.rewardOptions.map((option) => ({
                    ...option,
                    usageCount: usage.rewardOptions[option.id] ?? 0
                })),
                downsideOptions: suggestionsData.downsideOptions.map((option) => ({
                    ...option,
                    usageCount: usage.downsideOptions[option.id] ?? 0
                }))
            });
            return;
        }

        res.status(StatusCodes.OK).json(data);
    })
);

router.patch(
    "/:type",
    validateSettingsPermission("edit"),
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

        // Bulk-recompute `tags` on every suggestion referencing a changed reward/downside - skipped
        // entirely when nothing here touched tags, so an unrelated settings save stays fast.
        if (type === "suggestions") {
            const previous = existingDoc?.data as ISuggestionsSettings | undefined;
            const next = body as ISuggestionsSettings;
            const changedIds = [
                ...changedTagIds(previous?.rewardOptions, next.rewardOptions),
                ...changedTagIds(previous?.downsideOptions, next.downsideOptions)
            ];
            if (changedIds.length > 0) {
                await dataService.settings.resyncSuggestionTags(changedIds, next.rewardOptions, next.downsideOptions);
            }
        }

        res.status(StatusCodes.OK).json(updated.data);
    })
);

export default router;
