import * as Schemas from "common/models/schemas";
import { celebrate, Joi, Segments } from "@/celebrate";
import Permission from "common/models/permissions";
import asyncHandler from "express-async-handler";
import express from "express";
import { IArtist } from "common/models/artwork";
import { dataService } from "@/services";
import { validateRequest } from "@/middleware/permissions";
import { IGetRequest, IGetResponse } from "@/types";
import { StatusCodes } from "http-status-codes";
import { generateGetResponse, applyToFilter } from "@/utils";
import { ApiErrorResponse } from "@/errors";
import { getRequestSchema } from "@/schemas";
import { logActivity } from "@/services/activityLogService";
import { LogCategory } from "common/models/logs";
import { parseCardCode } from "common/utils";

const router = express.Router();

async function getArtists(
    filter: IGetRequest<IArtist>["filter"],
    orderBy: IGetRequest<IArtist>["orderBy"],
    page: IGetRequest<IArtist>["page"],
    perPage: IGetRequest<IArtist>["perPage"]
): Promise<IGetResponse<IArtist>> {
    const [result, count] = await Promise.all([
        dataService.artists.read(filter, orderBy, page, perPage),
        dataService.artists.count(filter)
    ]);
    return generateGetResponse(result, count);
}

const getQuerySchema = getRequestSchema(Schemas.Artist.Full, { name: "asc" });

/** Every card whose artwork credits this artist, as card codes for an error message */
async function referencedBy(id: string): Promise<string[]> {
    const slots = await dataService.slots.byArtist(id);
    return slots.map((slot) => parseCardCode(false, slot.project, slot.number));
}

// Read artists
router.get(
    "/",
    validateRequest(Permission.READ_ARTISTS),
    celebrate({ [Segments.QUERY]: getQuerySchema }),
    asyncHandler<unknown, unknown, unknown, IGetRequest<IArtist>>(async (req, res) => {
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getArtists(filter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

// Read single artist
router.get(
    "/:id",
    validateRequest(Permission.READ_ARTISTS),
    celebrate({ [Segments.PARAMS]: { id: Joi.string().required() } }),
    asyncHandler<{ id: string }, unknown, unknown, IGetRequest<IArtist>>(async (req, res) => {
        const { id } = req.params;
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getArtists(applyToFilter(filter, { id }), orderBy, page, perPage);
        const [artist] = response.items;
        if (!artist) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Invalid Data", `Artist "${id}" does not exist`);
        }
        res.status(StatusCodes.OK).json(artist);
    })
);

// Create artist
router.post(
    "/",
    validateRequest(Permission.EDIT_ARTISTS),
    celebrate({ [Segments.BODY]: Schemas.Artist.Draft }),
    asyncHandler<unknown, unknown, Omit<IArtist, "id" | "created" | "updated" | "createdBy" | "updatedBy">, unknown>(
        async (req, res) => {
            const created = await dataService.artists.create(req.body as IArtist);

            await logActivity(LogCategory.ARTIST, "artist.created", `<principal> added ${created.name} to the artists`);

            res.status(StatusCodes.OK).json(created);
        }
    )
);

// Edit artist
router.patch(
    "/:id",
    validateRequest(Permission.EDIT_ARTISTS),
    celebrate({
        [Segments.PARAMS]: { id: Joi.string().required() },
        [Segments.BODY]: Schemas.Artist.Draft
    }),
    asyncHandler<{ id: string }, unknown, Partial<IArtist>, unknown>(async (req, res) => {
        const { id } = req.params;
        const [artist] = await dataService.artists.read({ id });
        if (!artist) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Invalid Data", `Artist "${id}" does not exist`);
        }

        const updated = await dataService.artists.update({ ...artist, ...req.body, id });

        await logActivity(LogCategory.ARTIST, "artist.updated", `<principal> updated the artist ${updated.name}`);

        res.status(StatusCodes.OK).json(updated);
    })
);

// Delete artist - refused while any artwork still points at them, since the reference would be orphaned
router.delete(
    "/:id",
    validateRequest(Permission.EDIT_ARTISTS),
    celebrate({ [Segments.PARAMS]: { id: Joi.string().required() } }),
    asyncHandler<{ id: string }, unknown, unknown, unknown>(async (req, res) => {
        const { id } = req.params;
        const [artist] = await dataService.artists.read({ id });
        if (!artist) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Invalid Data", `Artist "${id}" does not exist`);
        }

        const referencing = await referencedBy(id);
        if (referencing.length > 0) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                `${artist.name} is still credited on ${referencing.join(", ")} - clear those first`
            );
        }

        const [deleted] = await dataService.artists.destroy({ id });

        await logActivity(LogCategory.ARTIST, "artist.deleted", `<principal> removed the artist ${artist.name}`, {
            severity: "warn"
        });

        res.status(StatusCodes.OK).json(deleted);
    })
);

export default router;
