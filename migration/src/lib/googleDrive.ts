import fs from "fs";
import path from "path";
import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";
import { log } from "./logger";

// Signs in as the person running the script, rather than a service account - reading a sheet's version history
// needs an editor of it. The first run opens a browser; the refresh token is kept so later runs don't.

export const GOOGLE_CREDENTIALS_PATH = path.resolve(process.cwd(), "google-credentials.json");
const TOKEN_PATH = path.resolve(process.cwd(), "google-token.json");
const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

type OAuthClientFile = { installed?: { client_id: string; client_secret: string } };

export async function authoriseDrive() {
    if (!fs.existsSync(GOOGLE_CREDENTIALS_PATH)) {
        throw new Error(
            `No OAuth client at ${GOOGLE_CREDENTIALS_PATH} - create a "Desktop app" OAuth client in Google Cloud ` +
                "(with the Drive API enabled) and save its JSON there"
        );
    }

    if (!fs.existsSync(TOKEN_PATH)) {
        const client = await authenticate({ keyfilePath: GOOGLE_CREDENTIALS_PATH, scopes: SCOPES });
        const { installed } = JSON.parse(fs.readFileSync(GOOGLE_CREDENTIALS_PATH, "utf-8")) as OAuthClientFile;
        if (!installed || !client.credentials.refresh_token) {
            throw new Error('Signed in, but Google returned no refresh token - is the OAuth client a "Desktop app"?');
        }
        fs.writeFileSync(
            TOKEN_PATH,
            JSON.stringify({
                type: "authorized_user",
                client_id: installed.client_id,
                client_secret: installed.client_secret,
                refresh_token: client.credentials.refresh_token
            }),
            "utf-8"
        );
        log.info(`Signed in - token kept at ${TOKEN_PATH}`);
    }

    const auth = google.auth.fromJSON(JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8")));
    return { drive: google.drive({ version: "v3", auth: auth as never }), auth };
}
