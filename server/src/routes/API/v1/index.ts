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
import decks from "./decks";
import render from "./render";
import suggestions from "./suggestions";
import broadcast from "./broadcast";
import logs from "./logs";
import impersonation from "./impersonation";
import { parseAPIRequest } from "@/middleware/filters";
import { dataService } from "@/services";
import { getContext } from "@/middleware/context";
import { logActivity } from "@/services/activityLogService";
import { LogCategory } from "common/models/logs";
import { isEnvironment } from "@/env";
import { blockMutationsWhileImpersonating } from "@/middleware/impersonation";
import { ACCESS_TOKEN_COOKIE, IMPERSONATION_COOKIE, impersonationCookieOptions, REFRESH_TOKEN_COOKIE, SESSION_ID_COOKIE } from "@/middleware/cookies";

const router = express.Router();
router.use("/users", parseAPIRequest, blockMutationsWhileImpersonating, users);
router.use("/roles", parseAPIRequest, blockMutationsWhileImpersonating, roles);
router.use("/integrations", parseAPIRequest, blockMutationsWhileImpersonating, integrations);
router.use("/cards", parseAPIRequest, blockMutationsWhileImpersonating, cards);
router.use("/projects", parseAPIRequest, blockMutationsWhileImpersonating, projects);
router.use("/playtesting-updates", parseAPIRequest, blockMutationsWhileImpersonating, playtestingUpdates);
router.use("/packs", parseAPIRequest, blockMutationsWhileImpersonating, packs);
router.use("/reviews", parseAPIRequest, blockMutationsWhileImpersonating, reviews);
router.use("/decks", parseAPIRequest, blockMutationsWhileImpersonating, decks);
router.use("/render", parseAPIRequest, blockMutationsWhileImpersonating, render);
router.use("/suggestions", parseAPIRequest, blockMutationsWhileImpersonating, suggestions);
router.use("/broadcast", parseAPIRequest, blockMutationsWhileImpersonating, broadcast);
router.use("/logs", parseAPIRequest, blockMutationsWhileImpersonating, logs);
router.use("/impersonation", impersonation);

router.post("/login", (req, res) => {
    res.redirect("/auth/discord");
});

const cookieOptions = {
    httpOnly: true,
    secure: isEnvironment("staging", "production"),
    sameSite: "lax" as const
};

router.post("/logout", asyncHandler(async (req, res) => {
    const sessionId = req.cookies[SESSION_ID_COOKIE];
    const context = getContext();

    if (sessionId && context.source === "client") {
        await dataService.auth.deleteSession(context.principal.discordId, sessionId);
        await logActivity(LogCategory.AUTH, "auth.logout", "<principal> logged out");
    }

    res.clearCookie(ACCESS_TOKEN_COOKIE, cookieOptions);
    res.clearCookie(REFRESH_TOKEN_COOKIE, cookieOptions);
    res.clearCookie(SESSION_ID_COOKIE, cookieOptions);
    res.clearCookie(IMPERSONATION_COOKIE, impersonationCookieOptions);
    res.sendStatus(200);
}));

export default router;
