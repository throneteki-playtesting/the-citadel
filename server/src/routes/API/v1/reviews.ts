import express, { Request } from "express";
import { celebrate, Joi, Segments } from "celebrate";
import asyncHandler from "express-async-handler";
import { dataService } from "@/services";
import * as Schemas from "common/models/schemas";
import { IPlaytestReview } from "common/models/reviews";
import { hasPermission, Regex, SemanticVersion, validate } from "common/utils";
import { StatusCodes } from "http-status-codes";
import { validateRequest } from "@/middleware/permissions";
import { Permission, User } from "common/models/user";
import { orderBy, paging } from "@/schemas";
import { IGetRequest, IGetResponse } from "@/types";
import { generateGetResponse } from "@/utils";
import { ApiErrorResponse } from "@/errors";

const router = express.Router();

const handleGetReviews = [
    validateRequest((user) => hasPermission(user, Permission.READ_REVIEWS)),
    celebrate({
        [Segments.QUERY]: {
            filter: Schemas.SingleOrArray(Schemas.PlaytestingReview.Partial),
            ...paging(),
            ...orderBy<IPlaytestReview>(Schemas.PlaytestingReview.Full, { updated: "desc" })
        }
    }),
    asyncHandler<unknown, unknown, unknown, IGetRequest<IPlaytestReview>>(async (req, res, next) => {
        const { filter, orderBy, page, perPage } = req.query;
        const result = await dataService.reviews.read(filter, orderBy, page, perPage);
        const count = await dataService.reviews.count(filter);

        req["response"] = generateGetResponse(result, count);
        next();
    })
];

// Read reviews
router.get("/",
    ...handleGetReviews,
    (req, res) => {
        const response = req["response"] as IGetResponse<IPlaytestReview>;
        res.status(StatusCodes.OK).json(response);
    }
);

// Read review by project/number/version/reviewer
router.get("/:project/:number/:version/:reviewer",
    celebrate({
        [Segments.PARAMS]: {
            project: Joi.number().required(),
            number: Joi.number().required(),
            version: Joi.string().required().regex(Regex.SemanticVersion),
            reviewer: Joi.string().required()
        }
    }),
    asyncHandler<{ project: number, number: number, version: SemanticVersion, reviewer: string }, unknown, unknown, unknown>(async (req, res, next) => {
        const { project, number, version, reviewer } = req.params;
        try {
            req.query["filter"] = { project, number, version, reviewer };
            next();
        } catch (err) {
            next(err);
        }
    }),
    ...handleGetReviews,
    (req, res) => {
        const response = req["response"] as IGetResponse<IPlaytestReview>;
        const [review] = response.items;
        res.status(StatusCodes.OK).json(review);
    }
);

// Create review
router.post("/",
    validateRequest((user) => hasPermission(user, Permission.MAKE_REVIEWS)),
    celebrate({
        [Segments.BODY]: Schemas.PlaytestingReview.Draft
    }),
    asyncHandler<unknown, unknown, IPlaytestReview, unknown>(async (req, res) => {
        const body = req.body;

        const created = new Date();
        let review = {
            ...body,
            created,
            updated: created
        } as IPlaytestReview;

        review = await dataService.reviews.create(review);

        res.status(StatusCodes.OK).json(review);
    })
);

// Update review
router.put("/:project/:number/:version/:reviewer",
    celebrate({
        [Segments.PARAMS]: {
            project: Joi.number().required(),
            number: Joi.number().required(),
            version: Joi.string().required().regex(Regex.SemanticVersion),
            reviewer: Joi.string().required()
        }
    }),
    validateRequest(async (user: User, req: Request<{ project: number, number: number, version: SemanticVersion, reviewer: string }, unknown, IPlaytestReview, unknown>) => {
        const { project, number, version, reviewer } = req.params;
        const [review] = await dataService.reviews.read({ project, number, version, reviewer });
        return !!review && hasPermission(user, Permission.EDIT_REVIEWS) || validate(user, Permission.MAKE_REVIEWS, (user) => user.discordId === review.reviewer);
    }),
    celebrate({
        [Segments.BODY]: Schemas.PlaytestingReview.Full
    }),
    asyncHandler<{ project: number, number: number, version: SemanticVersion, reviewer: string }, unknown, IPlaytestReview, unknown>(async (req, res) => {
        const { project, number, version, reviewer } = req.params;
        const body = req.body;

        body.project = project;
        body.number = number;
        body.version = version;
        body.reviewer = reviewer;
        body.updated = new Date();

        const review = await dataService.reviews.update(body);

        res.status(StatusCodes.OK).json(review);
    })
);

// Delete review
router.delete("/:project/:number/:version/:discordId",
    celebrate({
        [Segments.PARAMS]: {
            project: Joi.number().required(),
            number: Joi.number().required(),
            version: Joi.string().required().regex(Regex.SemanticVersion),
            reviewer: Joi.string().required()
        }
    }),
    validateRequest(async (user: User, req: Request<{ project: number, number: number, version: SemanticVersion, reviewer: string }, unknown, unknown, unknown>) => {
        const { project, number, version, reviewer } = req.params;
        const [review] = await dataService.reviews.read({ project, number, version, reviewer });
        return !!review && hasPermission(user, Permission.DELETE_REVIEWS) || validate(user, Permission.MAKE_REVIEWS, (user) => user.discordId === review.reviewer);
    }),
    asyncHandler<{ project: number, number: number, version: SemanticVersion, reviewer: string }, unknown, unknown, unknown>(async (req, res) => {
        const { project, number, version, reviewer } = req.params;
        const [deleted] = await dataService.reviews.destroy({ project, number, version, reviewer });
        if (!deleted) {
            throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Invalid Data", "Review for that project, number, version & reviewer does not exist");
        }
        res.status(StatusCodes.OK).json(deleted);
    })
);

// Legacy (GAS Api)
// router.post("/bulk", celebrate({
//     [Segments.BODY]: Joi.array().items(Schemas.PlaytestingReview.Draft)
// }), asyncHandler<unknown, unknown, IPlaytestReview[], unknown>(async (req, res) => {
//     const body = req.body;

//     await dataService.reviews.update(body, true);

//     const allCreated = [];
//     const allUpdated = [];
//     const allFailed = [];

//     const reviews = asArray(body);
//     const guilds = await discordService.getGuilds();
//     for (const guild of guilds) {
//         const { created, updated, failed } = await ReviewThreads.sync(guild, true, ...reviews);
//         allCreated.push(...created);
//         allUpdated.push(...updated);
//         allFailed.push(...failed);
//     }

//     res.send({
//         created: allCreated,
//         updated: allUpdated,
//         failed: allFailed
//     });
// }));

export default router;