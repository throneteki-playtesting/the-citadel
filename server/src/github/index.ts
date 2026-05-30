import { App, RequestError } from "octokit";
import { Octokit } from "@octokit/core";
import { logger } from "@/services";
import { PaginateInterface } from "@octokit/plugin-paginate-rest";
import { Api } from "@octokit/plugin-rest-endpoint-methods";
import { paginateGraphQLInterface } from "@octokit/plugin-paginate-graphql";

type GithubClient = Octokit & { paginate: PaginateInterface; } & paginateGraphQLInterface & Api & { retry: { retryRequest: (error: RequestError, retries: number, retryAfter: number) => RequestError; }; };

class GithubService {
    private client: GithubClient;
    private repoDetails: { owner: string, repo: string };
    constructor() {
        const owner = process.env.GITHUB_OWNER;
        const repo = process.env.GITHUB_REPOSITORY;
        const appId = process.env.GITHUB_APP_ID;
        const privateKey = process.env.GITHUB_PRIVATE_KEY;

        this.repoDetails = { owner, repo };

        this.initialiseClient(appId, privateKey).then(() => this.initialiseWebhooks());
    }

    private async initialiseClient(appId: string, privateKey: string) {
        const app = new App({
            appId,
            privateKey
        });
        const { data: installation } = await app.octokit.rest.apps.getOrgInstallation({ org: this.repoDetails.owner });
        logger.info(`GitHub connected with ${installation.app_slug}`);
        const octokit = await app.getInstallationOctokit(installation.id);
        this.client = octokit;
    }

    public getContext(): GithubContext {
        if (!this.client) {
            throw new Error("Github Client not initialised");
        }
        return {
            client: this.client,
            ...this.repoDetails
        };
    }

    private async initialiseWebhooks() {
        const { client, owner, repo } = this.getContext();
        const baseUrl = process.env.WEBHOOK_URL || process.env.SERVER_HOST;
        const { data: webhooks } = await client.rest.repos.listWebhooks({ owner, repo });

        const configs = [
            {
                url: `${baseUrl}/webhooks/github/issue`,
                events: ["issues"]
            },
            {
                url: `${baseUrl}/webhooks/github/pull-request`,
                events: ["pull_request"]
            }
        ];

        for (const config of configs) {
            const alreadyExists = webhooks.some(w => w.config.url === config.url);
            if (alreadyExists) {
                continue;
            };

            const { data: webhook } = await client.rest.repos.createWebhook({
                owner,
                repo,
                config: {
                    url: config.url,
                    content_type: "json",
                    secret: process.env.GITHUB_WEBHOOK_SECRET
                },
                events: config.events,
                active: true
            });

            webhooks.push(webhook);
        }

        logger.info(`${webhooks.length} Github webhooks connected`);
    }
}

export interface GithubContext {
    client: GithubClient,
    owner: string,
    repo: string
}

export default GithubService;