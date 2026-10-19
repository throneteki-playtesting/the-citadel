import express from "express";
import { celebrate, Joi, Segments } from "@/celebrate";
import asyncHandler from "express-async-handler";
import { StatusCodes } from "http-status-codes";
import { dataService } from "@/services";
import { IProject, IPoolEntry } from "common/models/projects";
import Permission from "common/models/permissions";
import { validateRequest } from "@/middleware/permissions";
import { getContext } from "@/middleware/context";
import { ApiErrorResponse } from "@/errors";
import { loadProject } from "@/utils";

const router = express.Router({ mergeParams: true });

const PoolParams = {
    project: Joi.number().required(),
    suggestion: Joi.string().required()
};

function currentUser() {
    const { principal } = getContext();
    return "discordId" in principal ? principal.discordId : "integration";
}

function assertDraft(project: IProject) {
    if (!project.draft) {
        throw new ApiErrorResponse(
            StatusCodes.NOT_ACCEPTABLE,
            "Invalid Project",
            "Suggestions are only pooled while a project is in draft"
        );
    }
}

// Read a draft project's pool, the earliest marked first
router.get(
    "/",
    validateRequest(Permission.CREATE_CARDS),
    celebrate({ [Segments.PARAMS]: { project: Joi.number().required() } }),
    loadProject,
    asyncHandler<{ project: number }, IPoolEntry[], unknown, unknown>(async (req, res) => {
        const entries = await dataService.pools.read({ project: req.params.project });
        const first = (entry: IPoolEntry) => Math.min(...entry.adds.map((mark) => new Date(mark.added).getTime()));
        res.status(StatusCodes.OK).json(entries.sort((a, b) => first(a) - first(b)));
    })
);

// Mark a suggestion as wanted in a draft project - one which isn't approved only once that has been confirmed
router.put(
    "/:suggestion",
    validateRequest(Permission.CREATE_CARDS),
    celebrate({
        [Segments.PARAMS]: PoolParams,
        [Segments.BODY]: Joi.object({ isUnapprovedConfirmed: Joi.boolean() })
    }),
    loadProject,
    asyncHandler<{ project: number; suggestion: string }, IPoolEntry, { isUnapprovedConfirmed?: boolean }, unknown>(
        async (req, res) => {
            const project = res.locals.project as IProject;
            assertDraft(project);
            const [suggestion] = await dataService.suggestions.read({ id: req.params.suggestion });
            if (!suggestion || suggestion.draft) {
                throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Not Found", "That suggestion does not exist");
            }
            if (!suggestion._metadata?.engagement?.approvedBy && !req.body.isUnapprovedConfirmed) {
                throw new ApiErrorResponse(
                    StatusCodes.CONFLICT,
                    "Not Approved",
                    "This suggestion has not been approved - confirm to pool it anyway"
                );
            }
            const user = currentUser();
            const [pooled] = await dataService.pools.read({ project: project.number, suggestion: suggestion.id });
            if (pooled?.adds.some((mark) => mark.user === user)) {
                res.status(StatusCodes.OK).json(pooled);
                return;
            }
            const entry = await dataService.pools.update({
                project: project.number,
                suggestion: suggestion.id,
                adds: [...(pooled?.adds ?? []), { user, added: new Date() }]
            });
            res.status(StatusCodes.OK).json(entry);
        }
    )
);

// Take a suggestion back out of a draft project's pool - wherever it has been placed, it stays placed
router.delete(
    "/:suggestion",
    validateRequest(Permission.CREATE_CARDS),
    celebrate({ [Segments.PARAMS]: PoolParams }),
    loadProject,
    asyncHandler<{ project: number; suggestion: string }, unknown, unknown, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        assertDraft(project);
        const user = currentUser();
        const [entry] = await dataService.pools.read({ project: project.number, suggestion: req.params.suggestion });
        if (!entry?.adds.some((mark) => mark.user === user)) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_FOUND,
                "Not Found",
                "You have not added that suggestion to this pool"
            );
        }
        // Only the caller's own mark goes - the suggestion leaves the pool once nobody wants it there
        const adds = entry.adds.filter((mark) => mark.user !== user);
        if (adds.length === 0) {
            await dataService.pools.destroy({ project: project.number, suggestion: entry.suggestion });
            res.status(StatusCodes.OK).json({ ...entry, adds });
            return;
        }
        res.status(StatusCodes.OK).json(await dataService.pools.update({ ...entry, adds }));
    })
);

export default router;
