import express from "express";
import { celebrate, Joi, Segments } from "@/celebrate";
import asyncHandler from "express-async-handler";
import { dataService } from "@/services";
import * as Schemas from "common/models/schemas";
import { IPlaytestReview } from "common/models/reviews";
import { hasPermission, Regex, SemanticVersion, validate } from "common/utils";
import { StatusCodes } from "http-status-codes";
import { validateRequest } from "@/middleware/permissions";
import Permission from "common/models/permissions";
import { IGetRequest, IGetResponse } from "@/types";
import { generateGetResponse, applyToFilter } from "@/utils";
import { ApiErrorResponse } from "@/errors";
import { getRequestSchema } from "@/schemas";
import { syncReviewForum } from "@/discord/forums/playtestingReviews";
import { cardSnapshot, logActivity, userSnapshot } from "@/services/activityLogService";
import { LogCategory } from "common/models/logs";
import { getContext } from "@/middleware/context";

const router = express.Router();

const reviewParams = {
    project: Joi.number().required(),
    number: Joi.number().required(),
    version: Joi.string().required().regex(Regex.SemanticVersion),
    reviewer: Joi.string().required()
};

async function getReviews(
    filter: IGetRequest<IPlaytestReview>["filter"],
    orderBy: IGetRequest<IPlaytestReview>["orderBy"],
    page: IGetRequest<IPlaytestReview>["page"],
    perPage: IGetRequest<IPlaytestReview>["perPage"]
): Promise<IGetResponse<IPlaytestReview>> {
    const [result, count] = await Promise.all([
        dataService.reviews.read(filter, orderBy, page, perPage),
        dataService.reviews.count(filter)
    ]);
    return generateGetResponse(result, count);
}

const getQuerySchema = getRequestSchema(
    Schemas.PlaytestingReview.Full,
    { updated: "desc" }
);

// Read reviews
router.get("/",
    validateRequest(Permission.READ_REVIEWS),
    celebrate({ [Segments.QUERY]: getQuerySchema }),
    asyncHandler<unknown, unknown, unknown, IGetRequest<IPlaytestReview>>(async (req, res) => {
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getReviews(filter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

// Read review by project/number/version/reviewer
router.get("/:project/:number/:version/:reviewer",
    validateRequest(Permission.READ_REVIEWS),
    celebrate({
        [Segments.PARAMS]: reviewParams,
        [Segments.QUERY]: getQuerySchema
    }),
    asyncHandler<{ project: number, number: number, version: SemanticVersion, reviewer: string }, unknown, unknown, IGetRequest<IPlaytestReview>>(async (req, res) => {
        const { project, number, version, reviewer } = req.params;
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getReviews(applyToFilter(filter, { project, number, version, reviewer }), orderBy, page, perPage);
        const [review] = response.items;
        res.status(StatusCodes.OK).json(review);
    })
);

// Create review
router.post("/",
    validateRequest(Permission.MAKE_REVIEWS),
    celebrate({ [Segments.BODY]: Schemas.PlaytestingReview.Draft }),
    // Reviewers may only submit their own review for the card's current latest version, unless they hold EDIT_REVIEWS
    validateRequest(async (principal, req) => {
        const review = req.body;
        if (hasPermission(principal, Permission.EDIT_REVIEWS)) {
            return true;
        }
        if (!("discordId" in principal) || principal.discordId !== review.reviewer) {
            return false;
        }
        const [card] = await dataService.cards.read({ project: review.project, number: review.number, version: review.version });
        return !!card?.latest;
    }),
    asyncHandler<unknown, unknown, IPlaytestReview, unknown>(async (req, res) => {
        let review = req.body;
        review = await dataService.reviews.create(review);

        const [card] = await dataService.cards.read({ project: review.project, number: review.number, version: review.version });

        await logActivity(
            LogCategory.REVIEW,
            "review.created",
            "<principal> submitted a review for <card>",
            { context: { card: cardSnapshot(`${review.project}|${review.number}|${review.version}`, card) } }
        );

        res.status(StatusCodes.OK).json(review);
    })
);

// Update review
router.put("/:project/:number/:version/:reviewer",
    // Initial check to see if they have one of the appropriate permissions
    validateRequest((principal) => hasPermission(principal, Permission.EDIT_REVIEWS) || hasPermission(principal, Permission.MAKE_REVIEWS)),
    celebrate({ [Segments.PARAMS]: reviewParams }),
    // Load review for ownership check
    asyncHandler<{ project: number, number: number, version: SemanticVersion, reviewer: string }, unknown, unknown, unknown>(async (req, res, next) => {
        const { project, number, version, reviewer } = req.params;
        const [review] = await dataService.reviews.read({ project, number, version, reviewer });
        if (!review) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Not Found", "Review for that project, number, version & reviewer does not exist");
        }
        res.locals.review = review;
        next();
    }),
    // Further permission check, now with context of the review
    validateRequest(async (principal, _req, res) => {
        const review = res.locals.review as IPlaytestReview;
        if (hasPermission(principal, Permission.EDIT_REVIEWS)) {
            return true;
        }

        if (!validate(principal, Permission.MAKE_REVIEWS, (principal) => "discordId" in principal && principal.discordId === review.reviewer)) {
            return false;
        }

        // Without EDIT_REVIEWS, reviewers may only amend their review for the card's current latest version
        const [card] = await dataService.cards.read({ project: review.project, number: review.number, version: review.version });
        return !!card?.latest;
    }),
    celebrate({ [Segments.BODY]: Schemas.PlaytestingReview.Draft }),
    asyncHandler<{ project: number, number: number, version: SemanticVersion, reviewer: string }, unknown, IPlaytestReview, unknown>(async (req, res) => {
        const { project, number, version, reviewer } = req.params;
        let review = req.body;

        review.project = project;
        review.number = number;
        review.version = version;
        review.reviewer = reviewer;

        review = await dataService.reviews.update(review);

        const [card] = await dataService.cards.read({ project, number, version });

        const { principal } = getContext();
        const isOwnReview = "discordId" in principal && principal.discordId === reviewer;
        const [reviewerUser] = isOwnReview ? [] : await dataService.users.read({ discordId: reviewer });

        await logActivity(
            LogCategory.REVIEW,
            "review.updated",
            reviewerUser ? "<principal> updated <targetUser>'s review for <card>" : "<principal> updated their review for <card>",
            { context: { card: cardSnapshot(`${project}|${number}|${version}`, card), ...(reviewerUser && { targetUser: userSnapshot(reviewerUser) }) } }
        );

        res.status(StatusCodes.OK).json(review);
    })
);

// Delete review
router.delete("/:project/:number/:version/:reviewer",
    // Initial check to see if they have one of the appropriate permissions
    validateRequest((principal) => hasPermission(principal, Permission.DELETE_REVIEWS) || hasPermission(principal, Permission.MAKE_REVIEWS)),
    celebrate({ [Segments.PARAMS]: reviewParams }),
    // Load review for ownership check
    asyncHandler<{ project: number, number: number, version: SemanticVersion, reviewer: string }, unknown, unknown, unknown>(async (req, res, next) => {
        const { project, number, version, reviewer } = req.params;
        const [review] = await dataService.reviews.read({ project, number, version, reviewer });
        if (!review) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Not Found", "Review for that project, number, version & reviewer does not exist");
        }
        res.locals.review = review;
        next();
    }),
    // Further permission check, now with context of the review
    validateRequest((principal, req, res) => {
        const review = res.locals.review as IPlaytestReview;
        return hasPermission(principal, Permission.DELETE_REVIEWS) ||
            validate(principal, Permission.MAKE_REVIEWS, (principal) => "discordId" in principal && principal.discordId === review.reviewer);
    }),
    asyncHandler<{ project: number, number: number, version: SemanticVersion, reviewer: string }, unknown, unknown, unknown>(async (req, res) => {
        const { project, number, version, reviewer } = req.params;
        const [deleted] = await dataService.reviews.destroy({ project, number, version, reviewer });

        const [card] = await dataService.cards.read({ project, number, version });

        const { principal } = getContext();
        const isOwnReview = "discordId" in principal && principal.discordId === reviewer;
        const [reviewerUser] = isOwnReview ? [] : await dataService.users.read({ discordId: reviewer });

        await logActivity(
            LogCategory.REVIEW,
            "review.deleted",
            reviewerUser ? "<principal> deleted <targetUser>'s review for <card>" : "<principal> deleted their review for <card>",
            { context: { card: cardSnapshot(`${project}|${number}|${version}`, card), ...(reviewerUser && { targetUser: userSnapshot(reviewerUser) }) }, severity: "warn" }
        );

        res.status(StatusCodes.OK).json(deleted);
    })
);

router.post("/:project/:number/:version/:reviewer/sync/:type",
    celebrate({
        [Segments.PARAMS]: {
            ...reviewParams,
            type: Joi.string().valid("discord")
        },
        [Segments.QUERY]: {
            forced: Joi.boolean()
        }
    }),
    validateRequest((principal, req) => {
        const { type } = req.params;
        switch (type) {
            case "discord": return hasPermission(principal, Permission.SYNC_REVIEW_DISCORD);
            default: return false;
        }
    }),
    asyncHandler<{ project: number, number: number, version: SemanticVersion, reviewer: string, type: "discord" }, unknown, unknown, { forced?: boolean }>(async (req, res) => {
        const { project, number, version, reviewer, type } = req.params;
        const { forced } = req.query;

        let [review] = await dataService.reviews.read({ project, number, version, reviewer });

        switch (type) {
            case "discord": {
                [review] = await syncReviewForum([review], forced);
                break;
            }
        }

        if (forced) {
            const [card] = await dataService.cards.read({ project, number, version });

            await logActivity(
                LogCategory.REVIEW,
                "review.synced",
                `<principal> forced a ${type} sync for the review on <card>`,
                { context: { card: cardSnapshot(`${project}|${number}|${version}`, card) } }
            );
        }

        res.status(StatusCodes.OK).json(review);
    })
);

export default router;