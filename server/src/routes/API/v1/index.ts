import express from "express";
import asyncHandler from "express-async-handler";
import users from "./users";
import roles from "./roles";
import integrations from "./integrations";
import cards from "./cards";
import projects from "./projects";
import playtestingUpdates from "./playtestingUpdates";
import packs from "./packs";
import reviews from "./reviews";
import render from "./render";
import suggestions from "./suggestions";
import broadcast from "./broadcast";
import logs from "./logs";
import { parseAPIRequest } from "@/middleware/filters";
import { dataService } from "@/services";
import { getContext } from "@/middleware/context";
import { logActivity } from "@/services/activityLogService";
import { LogCategory } from "common/models/logs";
import { isEnvironment } from "@/env";

const router = express.Router();
router.use("/users", parseAPIRequest, users);
router.use("/roles", parseAPIRequest, roles);
router.use("/integrations", parseAPIRequest, integrations);
router.use("/cards", parseAPIRequest, cards);
router.use("/projects", parseAPIRequest, projects);
router.use("/playtesting-updates", parseAPIRequest, playtestingUpdates);
router.use("/packs", parseAPIRequest, packs);
router.use("/reviews", parseAPIRequest, reviews);
router.use("/render", parseAPIRequest, render);
router.use("/suggestions", parseAPIRequest, suggestions);
router.use("/broadcast", parseAPIRequest, broadcast);
router.use("/logs", parseAPIRequest, logs);

router.post("/login", (req, res) => {
    res.redirect("/auth/discord");
});

const cookieOptions = {
    httpOnly: true,
    secure: isEnvironment("staging", "production"),
    sameSite: "lax" as const
};

router.post("/logout", asyncHandler(async (req, res) => {
    const { sessionId } = req.cookies;
    const context = getContext();

    if (sessionId && context.source === "client") {
        await dataService.auth.deleteSession(context.principal.discordId, sessionId);
        await logActivity(LogCategory.AUTH, "auth.logout", "<principal> logged out");
    }

    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("refreshToken", cookieOptions);
    res.clearCookie("sessionId", cookieOptions);
    res.sendStatus(200);
}));

export default router;
