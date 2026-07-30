import { App, RequestError } from "octokit";
import { Octokit } from "@octokit/core";
import { logger } from "@/services";
import { PaginateInterface } from "@octokit/plugin-paginate-rest";
import { Api } from "@octokit/plugin-rest-endpoint-methods";
import { paginateGraphQLInterface } from "@octokit/plugin-paginate-graphql";

type GithubClient = Octokit & { paginate: PaginateInterface } & paginateGraphQLInterface &
    Api & { retry: { retryRequest: (error: RequestError, retries: number, retryAfter: number) => RequestError } };

class GithubService {
    private client: GithubClient;

    private organisation = process.env.GITHUB_OWNER;
    private codeRepo = process.env.GITHUB_REPOSITORY;
    private dataRepo = process.env.GITHUB_REPOSITORY_DATA;

    constructor() {
        const appId = process.env.GITHUB_APP_ID;
        const privateKey = process.env.GITHUB_PRIVATE_KEY;

        this.initialiseClient(appId, privateKey).then(() => this.initialiseWebhooks());
    }

    private async initialiseClient(appId: string, privateKey: string) {
        const app = new App({
            appId,
            privateKey
        });
        const { data: installation } = await app.octokit.rest.apps.getOrgInstallation({ org: this.organisation });
        logger.info(`GitHub connected with ${installation.app_slug}`);
        const octokit = await app.getInstallationOctokit(installation.id);
        this.client = octokit;
    }

    public getContext(repo: "code" | "data" = "code"): GithubContext {
        if (!this.client) {
            throw new Error("Github Client not initialised");
        }
        return {
            client: this.client,
            owner: this.organisation,
            repo: repo === "code" ? this.codeRepo : this.dataRepo
        };
    }

    private async initialiseWebhooks() {
        const baseUrl = process.env.WEBHOOK_URL || process.env.SERVER_HOST;

        const repoConfigs: Array<{ context: "code" | "data"; webhooks: { path: string; events: string[] }[] }> = [
            {
                context: "code",
                webhooks: [
                    { path: "/webhooks/github/issue", events: ["issues"] },
                    { path: "/webhooks/github/push", events: ["push"] },
                    { path: "/webhooks/github/pull-request", events: ["pull_request"] }
                ]
            },
            {
                context: "data",
                webhooks: [{ path: "/webhooks/github/pull-request", events: ["pull_request"] }]
            }
        ];

        for (const { context, webhooks } of repoConfigs) {
            const { client, owner, repo } = this.getContext(context);
            const { data: existing } = await client.rest.repos.listWebhooks({ owner, repo });

            for (const { path, events } of webhooks) {
                const url = `${baseUrl}${path}`;
                if (existing.some((w) => w.config.url === url)) continue;

                const { data: webhook } = await client.rest.repos.createWebhook({
                    owner,
                    repo,
                    config: { url, content_type: "json", secret: process.env.GITHUB_WEBHOOK_SECRET },
                    events,
                    active: true
                });

                existing.push(webhook);
            }

            logger.info(`${existing.length} Github webhook(s) connected for ${repo}`);
        }
    }
}

export interface GithubContext {
    client: GithubClient;
    owner: string;
    repo: string;
}

export default GithubService;
