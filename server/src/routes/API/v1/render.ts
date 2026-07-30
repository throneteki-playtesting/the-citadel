import express from "express";
import { celebrate, Joi, Segments } from "@/celebrate";
import asyncHandler from "express-async-handler";
import { dataService } from "@/services";
import * as Schemas from "common/models/schemas";
import { IRenderCard } from "common/models/cards";
import { asArray } from "common/utils";
import { SingleOrArray } from "common/types";
import { ApiErrorResponse } from "@/errors";
import { StatusCodes } from "http-status-codes";
import { UUID } from "crypto";
import archiver from "archiver";
import { BatchRenderJobOptions, SingleRenderJobOptions } from "@/types";
import { validateRequest } from "@/middleware/permissions";
import Permission from "common/models/permissions";
import { asPDF, asPNG } from "@/rendering";

export type ResourceFormat = "JSON" | "TXT" | "PNG" | "PDF";

const router = express.Router();

router.post(
    "/",
    validateRequest(Permission.RENDER_CARDS),
    celebrate({
        [Segments.QUERY]: {
            format: Joi.string().insensitive().valid("PDF", "PNG").default("PNG"),
            rounded: Joi.boolean(),
            orientation: Joi.string().valid("horizontal", "vertical"),
            copies: Joi.number(),
            perPage: Joi.number()
        },
        [Segments.BODY]: Schemas.SingleOrArray(Schemas.RenderedCard.Full)
    }),
    asyncHandler<
        unknown,
        unknown,
        SingleOrArray<IRenderCard>,
        { format?: ResourceFormat } & SingleRenderJobOptions & BatchRenderJobOptions
    >(async (req, res) => {
        const { format } = req.query;
        const body = req.body;

        const cards = asArray(body);
        if (cards.length === 0) {
            throw new ApiErrorResponse(
                StatusCodes.BAD_REQUEST,
                "Invalid Arguments",
                "Must provide at least one card to render"
            );
        }

        switch (format) {
            case "PDF": {
                const { copies, perPage, rounded } = req.query;
                const pdf = await asPDF(cards, { copies, perPage, rounded });
                res.contentType("application/pdf");
                res.status(StatusCodes.OK).send(pdf);
                break;
            }
            case "PNG": {
                const { orientation, rounded } = req.query;
                if (cards.length === 1) {
                    const [card] = cards;
                    const image = await asPNG(card, { orientation, rounded });
                    res.type("png");
                    res.status(StatusCodes.OK).send(image.buffer);
                } else {
                    res.type("application/zip");
                    const images = await asPNG(cards, { orientation, rounded });
                    const archive = archiver("zip", { zlib: { level: 9 } });
                    archive.pipe(res);

                    archive.on("error", (err: unknown) => {
                        throw new ApiErrorResponse(
                            StatusCodes.INTERNAL_SERVER_ERROR,
                            "Archive Error",
                            "An internal server error has occurred during archive process of multiple rendered images",
                            err
                        );
                    });
                    for (const image of images) {
                        archive.append(image.buffer, { name: `${image.card.key}.png}` });
                    }
                    // Sends to client
                    archive.finalize();
                }
                break;
            }
        }
    })
);

router.get(
    "/job",
    celebrate({
        [Segments.QUERY]: {
            id: Joi.string()
                .guid({ version: ["uuidv4"] })
                .required()
        }
    }),
    asyncHandler<unknown, unknown, unknown, { id: UUID }>(async (req, res) => {
        const { id } = req.query;

        const job = await dataService.redis.get(id);
        if (!job || typeof job !== "string") {
            throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Invalid Id", `No render job exists for id "${id}"`);
        }
        const jobData = JSON.parse(job);

        res.status(StatusCodes.OK).json(jobData);

        await dataService.redis.del(id);
    })
);

export default router;
