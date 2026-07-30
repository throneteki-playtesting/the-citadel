import { CookieOptions } from "express";
import { isEnvironment } from "@/env";

export const ACCESS_TOKEN_COOKIE = "accessToken";
export const REFRESH_TOKEN_COOKIE = "refreshToken";
export const SESSION_ID_COOKIE = "sessionId";
export const IMPERSONATION_COOKIE = "impersonation";
export const OAUTH_STATE_COOKIE = "oauthState";

export const impersonationCookieOptions: CookieOptions = {
    httpOnly: true,
    secure: isEnvironment("staging", "production"),
    sameSite: "lax"
};
