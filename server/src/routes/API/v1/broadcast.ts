import express, { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { SyncType } from "@/types";
import { sseService } from "@/services/sseService";

const router = express.Router();

const sseHeaders = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
};

// Remove compression for SSE events
const disableCompression = (req: Request, res: Response, next: NextFunction) => {
    res.set("Cache-Control", "no-transform");
    next();
};

// Global broadcast channel — all connected web clients
router.get("/",
    disableCompression,
    (req, res) => {
        res.set(sseHeaders);
        res.flushHeaders();

        const clientId = randomUUID();
        sseService.addBroadcastClient(clientId, res);

        // Send a keepalive comment every 30 seconds
        const keepalive = setInterval(() => {
            res.write(": keepalive\n\n");
        }, 30000);

        req.on("close", () => {
            sseService.removeBroadcastClient(clientId);
            clearInterval(keepalive);
        });
    }
);

// Per-resource progress channel — opt-in per component
router.get("/progress/:type/:id",
    disableCompression,
    (req, res) => {
        const { type, id } = req.params;

        res.set(sseHeaders);
        res.flushHeaders();

        const clientId = randomUUID();
        sseService.addProgressClient(clientId, type as SyncType, id, res);

        // Send a keepalive comment every 30 seconds
        const keepalive = setInterval(() => {
            res.write(": keepalive\n\n");
        }, 30000);

        req.on("close", () => {
            sseService.removeBroadcastClient(clientId);
            sseService.removeProgressClient(clientId);
            clearInterval(keepalive);
        });
    }
);


export default router;