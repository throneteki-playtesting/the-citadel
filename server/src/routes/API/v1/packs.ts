import express from "express";
import { celebrate, Joi, Segments } from "@/celebrate";
import asyncHandler from "express-async-handler";
import { dataService } from "@/services";
import { IPack, IPlaytestPack } from "common/models/pack";
import { IProject } from "common/models/projects";
import { loadProjectByParam } from "@/utils";
import { StatusCodes } from "http-status-codes";
import { toJSONExportCard, getFinalCardNumber } from "common/utils";
import { ApiErrorResponse } from "@/errors";

const router = express.Router();

const ProjectParams = {
    project: Joi.number().required()
};

router.get("/:project/development",
    celebrate({ [Segments.PARAMS]: ProjectParams }),
    loadProjectByParam,
    asyncHandler<{ project: number }, unknown, unknown, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const cards = await dataService.cards.read({ project: project.number, latest: true });

        const pack: IPlaytestPack = {
            cgdbId: null,
            code: project.code,
            name: project.name,
            releaseDate: null,
            workInProgress: true,
            cards: cards.map((card) => toJSONExportCard(card))
        };

        res.status(StatusCodes.OK).json(pack);
    })
);

router.get("/:project/release/:code",
    celebrate({
        [Segments.PARAMS]: { ...ProjectParams, code: Joi.string().required() }
    }),
    loadProjectByParam,
    asyncHandler<{ project: number, code: string }, unknown, unknown, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { code } = req.params;

        const release = project.releases.find((r) => r.code === code);
        if (!release) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Invalid Data", `Release "${code}" does not exist for project #${project.number}`);
        }

        const slots = await dataService.slots.read({ project: project.number, release: { code } });
        const slotsByNumber = new Map(slots.map((slot) => [slot.number, slot]));
        const numbers = [...slotsByNumber.keys()];

        const cards = numbers.length > 0
            ? await dataService.cards.read({ project: project.number, number: { $in: numbers }, latest: true })
            : [];

        const exportCards = cards
            .map((card) => {
                const slot = slotsByNumber.get(card.number);
                const finalNumber = card.released?.number ?? getFinalCardNumber(project, slot)!;
                return { finalNumber, card: toJSONExportCard(card, { short: release.code, number: finalNumber }) };
            })
            .sort((a, b) => a.finalNumber - b.finalNumber)
            .map(({ card }) => card);

        const pack: IPack = {
            cgdbId: null,
            code: release.code,
            name: release.name,
            releaseDate: release.releasedDate ?? null,
            cards: exportCards
        };

        res.status(StatusCodes.OK).json(pack);
    })
);

export default router;
