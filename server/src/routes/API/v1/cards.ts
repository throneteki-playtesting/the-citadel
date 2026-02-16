import express from "express";
import { celebrate, Joi, Segments } from "celebrate";
import asyncHandler from "express-async-handler";
import PlaytestingCard from "@/data/models/cards/playtestingCard";
import { eq, inc } from "semver";
import { dataService, logger } from "@/services";
import { asArray, hasPermission, isPreview, parseCardCode, SemanticVersion } from "common/utils";
import { IPlaytestCard, NoteType } from "common/models/cards";
import * as Schemas from "common/models/schemas";
import { DeepPartial, SingleOrArray } from "common/types";
import { Permission } from "common/models/user";
import { ApiErrorResponse } from "@/errors";
import { StatusCodes } from "http-status-codes";
import { validateRequest } from "@/middleware/permissions";
import { generateGetResponse, NoteVersion } from "@/utils";
import { orderBy, paging } from "@/schemas";
import { IGetRequest, IGetResponse } from "@/types";

const router = express.Router();

const handleGetCards = [
    validateRequest((user) => hasPermission(user, Permission.READ_CARDS)),
    celebrate({
        [Segments.QUERY]: {
            filter: Schemas.SingleOrArray(Schemas.PlaytestingCard.Partial),
            ...paging(),
            ...orderBy(Schemas.PlaytestingCard.Full, { project: "asc", number: "asc", version: "asc" })
        }
    }),
    asyncHandler<unknown, unknown, unknown, IGetRequest<IPlaytestCard>>(async (req, res, next) => {
        const { filter, orderBy, page, perPage } = req.query;

        const result = await dataService.cards.read(filter, orderBy, page, perPage);
        const count = await dataService.cards.count(filter);
        req["response"] = generateGetResponse(result, count);
        next();
    })
];

// Read cards
router.get("/",
    ...handleGetCards,
    (req, res) => {
        const response = req["response"] as IGetResponse<IPlaytestCard>;
        res.status(StatusCodes.OK).json(response);
    }
);

// Read cards for project
router.get("/:project",
    celebrate({
        [Segments.PARAMS]: {
            project: Joi.number().required()
        }
    }),
    asyncHandler<{ project: number }, unknown, unknown, IGetRequest<IPlaytestCard>>((req, res, next) => {
        const { project } = req.params;
        let { filter } = req.query;
        try {
            filter = filter || {};
            if (Array.isArray(filter)) {
                filter.forEach((f) => f.project = project);
            } else {
                filter.project = project;
            }
            req.query.filter = filter;
            next();
        } catch (err) {
            next(err);
        }
    }),
    ...handleGetCards,
    (req, res) => {
        const response = req["response"] as IGetResponse<IPlaytestCard>;
        res.status(StatusCodes.OK).json(response);
    }
);

// Read all versions of card in project
router.get("/:project/:number",
    celebrate({
        [Segments.PARAMS]: {
            project: Joi.number().required(),
            number: Joi.number().required()
        }
    }),
    asyncHandler<{ project: number, number: number }, unknown, unknown, IGetRequest<IPlaytestCard>>((req, res, next) => {
        const { project, number } = req.params;
        let { filter } = req.query;
        try {
            filter = filter || {};
            if (Array.isArray(filter)) {
                filter.forEach((f) => {
                    f.project = project;
                    f.number = number;
                });
            } else {
                filter.project = project;
                filter.number = number;
            }
            req.query.filter = filter;
            next();
        } catch (err) {
            next(err);
        }
    }),
    ...handleGetCards,
    (req, res) => {
        const response = req["response"] as IGetResponse<IPlaytestCard>;
        res.status(StatusCodes.OK).json(response);
    }
);

// Update draft card
router.put("/:project/:number/draft",
    celebrate({
        [Segments.PARAMS]: {
            project: Joi.number().required(),
            number: Joi.number().required()
        },
        [Segments.BODY]: Schemas.PlaytestingCard.Draft
    }),
    validateRequest(async (user, req) => {
        const { project: projectNumber, number } = req.params;
        const { version } = req.body;
        const [project] = await dataService.projects.read({ number: projectNumber });
        if (!project) {
            throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Invalid Data", `Project #${projectNumber} does not exist`);
        }
        const [latest] = await dataService.cards.read({ project: projectNumber, number, latest: true });
        const [draft] = await dataService.cards.read({ project: projectNumber, number, draft: true });

        if (!project.draft && !(latest || draft)) {
            throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Invalid Data", `Card #${number} does not exist for project #${projectNumber}`);
        }
        if (project.draft && !eq(version, "0.0.0")) {
            throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Invalid Data", `Project #${projectNumber} is in draft and cannot accept cards with non-0.0.0 version`);
        }

        req["project"] = project;
        req["latest"] = latest;
        req["draft"] = draft;
        return hasPermission(user, (draft ? Permission.EDIT_CARDS : Permission.CREATE_CARDS));
    }),
    asyncHandler<{ project: number, number: number }, IPlaytestCard, IPlaytestCard, unknown>(async (req, res) => {
        const { project, number } = req.params;
        const latest = req["latest"] as IPlaytestCard | undefined;
        const existing = req["draft"] as IPlaytestCard | undefined;

        let card = req.body;
        const code = parseCardCode(false, project, number);

        // If card does not exist, version should be preview (0.0.0)
        let version = "0.0.0" as SemanticVersion;
        if (latest) {
            // Preview cards are simply updated, without version incrementing
            // To initialise all preview cards to 1.0.0, use /:project/initialise
            version = isPreview(latest) ? latest.version : inc(latest.version, NoteVersion[card.note.type]) as SemanticVersion;
        }

        if (existing && existing.version !== version) {
            // Existing draft with different version needs to be removed first as upsert will not match (as version is a primary key)
            await dataService.cards.destroy({ project, number, version: existing.version });
        }

        card.code = code;
        card.version = version;
        card.draft = true;
        card.latest = false;
        card.implemented = false;
        delete card.github;
        delete card.release;
        card = await dataService.cards.update(card, true);

        res.status(StatusCodes.OK).json(card);
    })
);

// Delete draft card
router.delete("/:project/:number/draft",
    validateRequest((user) => hasPermission(user, Permission.DELETE_CARDS)),
    celebrate({
        [Segments.PARAMS]: {
            project: Joi.number().required(),
            number: Joi.number().required()
        }
    }),
    asyncHandler<{ project: number, number: number, version: SemanticVersion }, unknown, unknown, unknown>(async (req, res) => {
        const { project, number } = req.params;
        const [deleted] = await dataService.cards.destroy({ project, number, draft: true });
        if (!deleted) {
            throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Invalid Data", `Draft card for #${number} in project #${project} does not exist`);
        }
        res.status(StatusCodes.OK).json(deleted);
    })
);

// TODO: Consider adding update + delete any card (with separate permission)

// Legacy (GAS script updates)
router.post("/",
    validateRequest((user) => hasPermission(user, Permission.CREATE_CARDS)),
    celebrate({
        [Segments.BODY]: Schemas.SingleOrArray(Schemas.PlaytestingCard.Full)
    }),
    asyncHandler<unknown, unknown, SingleOrArray<IPlaytestCard>, unknown>(async (req, res) => {
        const body = req.body;
        const cards = asArray(body).map((card) => new PlaytestingCard(card));

        const incType = (type: NoteType) => {
            switch (type) {
                case "replaced": return "major";
                case "reworked": return "minor";
                case "updated": return "patch";
            }
        };
        logger.verbose(`Recieved ${cards.length} card update(s) from sheets`);
        const latest: IPlaytestCard[] = [];
        const upsert: IPlaytestCard[] = [];
        const destroy: DeepPartial<IPlaytestCard>[] = [];

        for (const card of cards) {
        // If card is not in playtesting, push updates
            if (!card.playtesting) {
                upsert.push(card);
            }

            // If card is currently being drafted (eg. edited)
            if (card.isDraft) {
                const expectedVersion = inc(card.playtesting, incType(card.note.type));
                // If it's version has not been incremented, increment it, and push new id card to database/archive
                if (card.version !== expectedVersion) {
                    const newCard = card.clone();
                    // Setting the incremented version of "latest" (card) for sheet and to the newly upserted card into database
                    card.version = newCard.version = inc(card.playtesting, incType(card.note.type)) as SemanticVersion;
                    upsert.push(newCard);
                } else {
                    upsert.push(card);
                }
                // Either way, push changes to latest to properly sync
                latest.push(card);
            }
            // If versions do not match (and is not in draft), then a draft has been reverted, and thus should be deleted in database/archive, and version reverted in latest
            else if (card.version !== card.playtesting) {
                destroy.push({ project: card.project, number: card.number, version: card.version });
                card.version = card.playtesting;
                latest.push(card);
            }
        }

        await dataService.cards.update(upsert, true);
        if (destroy.length > 0) {
            await dataService.cards.destroy(destroy);
        }
        await dataService.cards.spreadsheet.update(latest, { sheets: ["latest"] });

        res.status(StatusCodes.OK).send({
            updated: upsert.length + latest.length,
            deleted: destroy.length
        });
    })
);

export default router;