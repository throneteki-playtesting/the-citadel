import express, { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { sseService } from "@/services/sseService";
import { logger } from "@/services";

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
        sseService.sendConnected(res, clientId);
        logger.verbose(`[SSE] Broadcast client connected: ${clientId}`);

        // Send a keepalive comment every 30 seconds
        const keepalive = setInterval(() => {
            res.write(": keepalive\n\n");
            logger.verbose(`[SSE] Broadcast keepalive sent to client: ${clientId}`);
        }, 30000);

        req.on("close", () => {
            sseService.removeBroadcastClient(clientId);
            clearInterval(keepalive);
            logger.verbose(`[SSE] Broadcast client disconnected: ${clientId}`);
        });
    }
);

// Shared progress channel — one connection per client, all resource types
router.get("/progress",
    disableCompression,
    (req, res) => {
        res.set(sseHeaders);
        res.flushHeaders();

        const clientId = randomUUID();
        sseService.addProgressClient(clientId, res);
        logger.verbose(`[SSE] Progress client connected: ${clientId}`);

        // Send a keepalive comment every 30 seconds
        const keepalive = setInterval(() => {
            res.write(": keepalive\n\n");
            logger.verbose(`[SSE] Progress keepalive sent to client: ${clientId}`);
        }, 30000);

        req.on("close", () => {
            sseService.removeProgressClient(clientId);
            clearInterval(keepalive);
            logger.verbose(`[SSE] Progress client disconnected: ${clientId}`);
        });
    }
);


export default router;