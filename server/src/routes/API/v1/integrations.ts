import { dataService } from "@/services";
import { celebrate, Joi, Segments } from "@/celebrate";
import * as Schemas from "common/models/schemas";
import express from "express";
import asyncHandler from "express-async-handler";
import Permission from "common/models/permissions";
import { PermissionErrorResponse, validatePermissionDependencies, validateRequest } from "@/middleware/permissions";
import { StatusCodes } from "http-status-codes";
import { IGetRequest } from "@/types";
import { generateGetResponse } from "@/utils";
import { Integration, SafeIntegration } from "common/models/auth";
import { getRequestSchema } from "@/schemas";
import { getContext } from "@/middleware/context";
import { asArray, hasPermission } from "common/utils";
import { ApiErrorResponse } from "@/errors";
import { Filter } from "common/types";
import { omit } from "lodash-es";
import { integrationSnapshot, logActivity } from "@/services/activityLogService";
import { LogCategory } from "common/models/logs";

const router = express.Router();

function sanitize(integration: Integration): SafeIntegration {
    return omit(integration, ["tokenHash", "internal"]);
}

function notFound() {
    return new ApiErrorResponse(StatusCodes.NOT_FOUND, "Not Found", "Integration does not exist");
}

async function readIntegration(id: string) {
    const integration = await dataService.integrations.readOne(id);
    if (!integration) {
        throw notFound();
    }
    return integration;
}

const getQuerySchema = getRequestSchema(Schemas.Integration.Full, { name: "asc" });

// Read integrations; users without READ_INTEGRATIONS only see integrations they own
router.get(
    "/",
    validateRequest((principal) => principal.id !== "anonymous"),
    celebrate({ [Segments.QUERY]: getQuerySchema }),
    asyncHandler<unknown, unknown, unknown, IGetRequest<Integration>>(async (req, res) => {
        const { principal } = getContext();
        const { filter, orderBy, page, perPage } = req.query;

        let scopedFilter = filter;
        if (!hasPermission(principal, Permission.READ_INTEGRATIONS)) {
            scopedFilter = asArray(filter ?? {}).map((f) => ({ ...f, ownerIds: principal.id }) as Filter<Integration>);
        }

        const [result, count] = await Promise.all([
            dataService.integrations.read(scopedFilter, orderBy, page, perPage),
            dataService.integrations.count(scopedFilter)
        ]);
        res.status(StatusCodes.OK).json(generateGetResponse(result.map(sanitize), count));
    })
);

// Create integration; the raw token is only ever returned here
router.post(
    "/",
    validateRequest(Permission.CREATE_INTEGRATIONS),
    validatePermissionDependencies(),
    celebrate({ [Segments.BODY]: Schemas.Integration.Full }),
    asyncHandler<unknown, unknown, Integration, unknown>(async (req, res) => {
        const { name, enabled, permissions, ownerIds } = req.body;

        const { rawToken, integration } = await dataService.integrations.generate({
            name,
            enabled,
            permissions,
            ownerIds
        });

        await logActivity(
            LogCategory.INTEGRATION,
            "integration.created",
            "<principal> created integration <integration>",
            { context: { integration: integrationSnapshot(integration) } }
        );

        res.status(StatusCodes.CREATED).json({ token: rawToken, integration: sanitize(integration) });
    })
);

// Update integration; owners may edit their own, but cannot change its permissions
router.put(
    "/:id",
    validateRequest((principal) => principal.id !== "anonymous"),
    validatePermissionDependencies(),
    celebrate({
        [Segments.PARAMS]: { id: Joi.string().required() },
        [Segments.BODY]: Schemas.Integration.Full
    }),
    asyncHandler<{ id: string }, unknown, Integration, unknown>(async (req, res) => {
        const { principal } = getContext();
        const { id } = req.params;
        const { name, enabled, permissions, ownerIds } = req.body;

        const existing = await readIntegration(id);
        const canEdit = hasPermission(principal, Permission.EDIT_INTEGRATIONS);
        if (!canEdit && !existing.ownerIds?.includes(principal.id)) {
            throw new PermissionErrorResponse();
        }

        const result = await dataService.integrations.update({
            ...existing,
            name,
            enabled,
            ownerIds,
            permissions: canEdit ? permissions : existing.permissions
        });

        await logActivity(
            LogCategory.INTEGRATION,
            "integration.updated",
            "<principal> updated integration <integration>",
            { context: { integration: integrationSnapshot(result) }, details: { updated: result } }
        );

        res.status(StatusCodes.OK).json(sanitize(result));
    })
);

// Recycle integration token; immediately invalidates the previous token
router.post(
    "/:id/token",
    validateRequest((principal) => principal.id !== "anonymous"),
    celebrate({ [Segments.PARAMS]: { id: Joi.string().required() } }),
    asyncHandler<{ id: string }, unknown, unknown, unknown>(async (req, res) => {
        const { principal } = getContext();
        const { id } = req.params;

        const existing = await readIntegration(id);
        if (
            !hasPermission(principal, Permission.REFRESH_INTEGRATION_TOKENS) &&
            !existing.ownerIds?.includes(principal.id)
        ) {
            throw new PermissionErrorResponse();
        }

        const { rawToken, integration } = await dataService.integrations.recycleToken(existing);

        await logActivity(
            LogCategory.INTEGRATION,
            "integration.token_rotated",
            "<principal> rotated the token for integration <integration>",
            { context: { integration: integrationSnapshot(existing) }, severity: "warn" }
        );

        res.status(StatusCodes.OK).json({ token: rawToken, integration: sanitize(integration) });
    })
);

// Delete integration
router.delete(
    "/:id",
    validateRequest(Permission.DELETE_INTEGRATIONS),
    celebrate({ [Segments.PARAMS]: { id: Joi.string().required() } }),
    asyncHandler<{ id: string }, unknown, unknown, unknown>(async (req, res) => {
        const { id } = req.params;

        const [destroyed] = await dataService.integrations.destroy(id);
        if (!destroyed) {
            throw notFound();
        }

        await logActivity(
            LogCategory.INTEGRATION,
            "integration.deleted",
            "<principal> deleted integration <integration>",
            { context: { integration: integrationSnapshot(destroyed) }, severity: "warn" }
        );

        res.status(StatusCodes.OK).json(sanitize(destroyed));
    })
);

export default router;
