import { dataService } from "@/services";
import { celebrate, Segments } from "@/celebrate";
import * as Schemas from "common/models/schemas";
import express from "express";
import asyncHandler from "express-async-handler";
import Permission from "common/models/permissions";
import { validateRequest } from "@/middleware/permissions";
import { IGetRequest, IGetResponse } from "@/types";
import { generateGetResponse } from "@/utils";
import { StatusCodes } from "http-status-codes";
import { ILogEntry } from "common/models/logs";
import { getRequestSchema } from "@/schemas";

const router = express.Router();

async function getLogs(
    filter: IGetRequest<ILogEntry>["filter"],
    orderBy: IGetRequest<ILogEntry>["orderBy"],
    page: IGetRequest<ILogEntry>["page"],
    perPage: IGetRequest<ILogEntry>["perPage"]
): Promise<IGetResponse<ILogEntry>> {
    const [result, count] = await Promise.all([
        dataService.logs.read(filter, orderBy, page, perPage),
        dataService.logs.count(filter)
    ]);
    return generateGetResponse(result, count);
}

const getQuerySchema = getRequestSchema(Schemas.Log.Full, { created: "desc" });

// Read logs
router.get(
    "/",
    validateRequest(Permission.READ_LOGS),
    celebrate({ [Segments.QUERY]: getQuerySchema }),
    asyncHandler<unknown, unknown, unknown, IGetRequest<ILogEntry>>(async (req, res) => {
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getLogs(filter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

export default router;
