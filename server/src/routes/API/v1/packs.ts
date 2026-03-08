import express from "express";
import { celebrate, Joi, Segments } from "celebrate";
import asyncHandler from "express-async-handler";
import { dataService } from "@/services";
import { IPack, IPlaytestPack, ReleaseDate } from "common/models/pack";
import { ApiErrorResponse } from "@/errors";
import { StatusCodes } from "http-status-codes";
import { IProject } from "common/models/projects";

const router = express.Router();

const validateProjectParam = () => {
    return asyncHandler<{ project: number }, unknown, unknown, unknown>(async (req, res, next) => {
        const { project: number } = req.params;
        const [project] = await dataService.projects.read({ number });
        if (!project) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Invalid Number", "Project with that number does not exist");
        }
        req["project"] = project;
        next();
    });
};
// TODO: Openapi spec
router.get("/:project/development",
    celebrate({
        [Segments.PARAMS]: {
            project: Joi.number().required()
        }
    }),
    validateProjectParam(),
    asyncHandler<{ project: number }, unknown, unknown, unknown>(async (req, res) => {
        const project = req["project"] as IProject;
        const cards = await dataService.cards.read({ project: project.number, latest: true, release: null });

        const pack: IPlaytestPack = {
            cgdbId: null,
            code: project.code,
            name: project.name,
            releaseDate: null,
            workInProgress: true,
            cards
        };

        res.json(pack);
    }));

router.get("/:project/release",
    celebrate({
        [Segments.PARAMS]: {
            project: Joi.number().required()
        }
    }),
    validateProjectParam(),
    celebrate({
        [Segments.QUERY]: {
            short: Joi.string().required(),
            name: Joi.string().required(),
            release: Joi.date().required()
        }
    }),
    asyncHandler<{ project: number }, unknown, unknown, { short: string, name: string, release: Date }>(async (req, res) => {
        const project = req["project"] as IProject;
        const { short, name, release } = req.query;

        const cards = await dataService.cards.read({ project: project.number, latest: true, release: { short } });
        // TODO: Add validation
        const releaseDate = new Date(release.getTime() - (release.getTimezoneOffset() * 60000)).toISOString().split("T")[0] as ReleaseDate;
        const pack: IPack = {
            cgdbId: null,
            code: short,
            name,
            releaseDate,
            cards
        };

        res.json(pack);
    }));

export default router;