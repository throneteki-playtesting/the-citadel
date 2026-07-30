import { JWT } from "google-auth-library";
import { Response } from "gas/restClient";
import { buildUrl } from "common/utils";

export default class GasClient {
    private readonly scriptSuffix: string;
    private clientEmail: string;
    private privateKey: string;
    constructor() {
        this.clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
        this.privateKey = process.env.GOOGLE_PRIVATE_KEY;
        this.scriptSuffix = process.env.NODE_ENV !== "production" ? "dev" : "exec";
    }

    private async getAuthorization() {
        const client = new JWT({
            email: this.clientEmail,
            key: this.privateKey,
            scopes: [
                "https://www.googleapis.com/auth/drive.file",
                "https://www.googleapis.com/auth/script.processes",
                "https://www.googleapis.com/auth/drive.readonly",
                "https://www.googleapis.com/auth/script.external_request",
                "https://www.googleapis.com/auth/script.scriptapp"
            ]
        });
        const { token } = await client.getAccessToken();
        return `Bearer ${token}`;
    }

    private async fetch<T>(url: string, request: RequestInit) {
        if (!(request.headers && request.headers["Authorization"])) {
            request.headers = request.headers || {};
            request.headers["Authorization"] = await this.getAuthorization();
        }
        url = url.replace(/(script\.google\.com\/macros\/s\/[^/]+)/, `$1/${this.scriptSuffix}`);
        const response = await fetch(url, request);

        if (!response.ok) {
            throw Error(`Google App Script ${request.method} request failed`, {
                cause: { status: response.status, message: response.statusText }
            });
        }

        const json = (await response.json()) as Response<T>;

        if (json.error) {
            throw Error(`Google App Script ${request.method} request successful, but returned error(s)`, {
                cause: json.error
            });
        }

        return json.data;
    }

    public async get<T>(baseUrl: string, queryParameters?: { [key: string]: unknown }) {
        const url = buildUrl(baseUrl, queryParameters);
        return await this.fetch<T>(url, { method: "GET" });
    }

    public async post<T>(baseUrl: string, queryParameters?: { [key: string]: unknown }, body?: BodyInit) {
        const url = buildUrl(baseUrl, queryParameters);
        return await this.fetch<T>(url, { method: "POST", ...(body && { body }) });
    }
}
