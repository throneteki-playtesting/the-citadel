import express from "express";
import { celebrate, Joi, Segments } from "celebrate";
import asyncHandler from "express-async-handler";
import { dataService } from "@/services";
import { IPack, IPlaytestPack, ReleaseDate } from "common/models/pack";
import { IProject } from "common/models/projects";
import { loadProjectByParam } from "@/utils";
import { StatusCodes } from "http-status-codes";

const router = express.Router();

const ProjectParams = {
    project: Joi.number().required()
};

router.get("/:project/development",
    celebrate({ [Segments.PARAMS]: ProjectParams }),
    loadProjectByParam,
    asyncHandler<{ project: number }, unknown, unknown, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const cards = await dataService.cards.read({ project: project.number, latest: true, release: null });

        const pack: IPlaytestPack = {
            cgdbId: null,
            code: project.code,
            name: project.name,
            releaseDate: null,
            workInProgress: true,
            cards
        };

        res.status(StatusCodes.OK).json(pack);
    })
);

router.get("/:project/release",
    celebrate({
        [Segments.PARAMS]: ProjectParams,
        [Segments.QUERY]: {
            short: Joi.string().required(),
            name: Joi.string().required(),
            release: Joi.date().required()
        }
    }),
    loadProjectByParam,
    asyncHandler<{ project: number }, unknown, unknown, { short: string, name: string, release: Date }>(async (req, res) => {
        const project = res.locals.project as IProject;
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

        res.status(StatusCodes.OK).json(pack);
    })
);

export default router;