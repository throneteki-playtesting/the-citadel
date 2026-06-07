/* eslint-disable @typescript-eslint/no-explicit-any */
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { log } from "./logger";

let octokit: Octokit | null = null;

export function getGithubClient(): Octokit {
    if (octokit) return octokit;

    // GITHUB_APP_ID comes in as a string from env — Octokit auth-app expects a number
    const appId = parseInt(process.env.GITHUB_APP_ID as string, 10);
    if (isNaN(appId)) throw new Error("GITHUB_APP_ID is not a valid number");

    // Private key may have literal \n in the env value rather than real newlines
    const privateKey = (process.env.GITHUB_PRIVATE_KEY as string).replace(/\\n/g, "\n");

    octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: { appId, privateKey }
    });

    return octokit;
}

export type GithubIssueData = {
    status: "open" | "closed";
    issueUrl: string;
    closedAt: Date | null;
};

// Cache to avoid re-fetching the same issue number in the same run
const issueCache = new Map<number, GithubIssueData>();

export async function fetchIssueData(issueNumber: number): Promise<GithubIssueData | null> {
    if (issueCache.has(issueNumber)) {
        return issueCache.get(issueNumber)!;
    }

    try {
        const client = getGithubClient();
        const owner = process.env.GITHUB_OWNER as string;
        const repo = process.env.GITHUB_REPOSITORY as string;

        const { data } = await client.issues.get({ owner, repo, issue_number: issueNumber });

        const result: GithubIssueData = {
            status: data.state === "closed" ? "closed" : "open",
            issueUrl: data.html_url,
            closedAt: data.closed_at ? new Date(data.closed_at) : null
        };

        issueCache.set(issueNumber, result);
        log.verbose(`Fetched GitHub issue #${issueNumber}: ${result.status}`);
        return result;
    } catch (err: any) {
        if (err?.status === 404) {
            log.warn(`GitHub issue #${issueNumber} not found`);
            return null;
        }
        throw new Error(`Failed to fetch GitHub issue #${issueNumber}: ${err?.message ?? err}`);
    }
}

// Extract issue number from a GitHub issue URL (e.g. https://github.com/owner/repo/issues/42)
export function parseIssueNumber(issueUrl: string): number | null {
    const match = issueUrl.match(/\/issues\/(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
}
