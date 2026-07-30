/* eslint-disable @typescript-eslint/no-explicit-any */
import { App, RequestError } from "octokit";
import { Octokit } from "@octokit/core";
import { PaginateInterface } from "@octokit/plugin-paginate-rest";
import { Api } from "@octokit/plugin-rest-endpoint-methods";
import { paginateGraphQLInterface } from "@octokit/plugin-paginate-graphql";
import { log, createProgress } from "./logger";
import { Endpoints } from "@octokit/types";

type Issue = Endpoints["GET /repos/{owner}/{repo}/issues/{issue_number}"]["response"]["data"];

type GithubClient = Octokit & { paginate: PaginateInterface } & paginateGraphQLInterface &
    Api & { retry: { retryRequest: (error: RequestError, retries: number, retryAfter: number) => RequestError } };

let client: GithubClient;

export async function getGithubClient(): Promise<GithubClient> {
    if (client) return client;

    const appId = process.env.GITHUB_APP_ID as string;
    const privateKey = (process.env.GITHUB_PRIVATE_KEY as string).replace(/\\n/g, "\n");
    const owner = process.env.GITHUB_OWNER as string;

    const app = new App({ appId, privateKey });
    const { data: installation } = await app.octokit.rest.apps.getOrgInstallation({ org: owner });
    log.info(`GitHub connected with ${installation.app_slug}`);
    client = (await app.getInstallationOctokit(installation.id)) as unknown as GithubClient;

    return client;
}

// ─── Issues ───────────────────────────────────────────────────────────────────

export type GithubIssueData = {
    status: "open" | "closed";
    issueUrl: string;
    closedAt: Date | null;
    created: Date;
    updated: Date;
};

// All issues loaded into memory once — keyed two ways for fast lookup
type IssueIndex = {
    byNumber: Map<number, GithubIssueData>;
    // "<cardCode>-<version>" -> GithubIssueData, built from title parsing
    byCardCodeVersion: Map<string, GithubIssueData>;
};

let issueIndex: IssueIndex | null = null;

// Issue title formats for card changes:
//   updated  -> "<code> | ... - Update <name> (<version>)"
//   reworked -> "<code> | ... - Rework as <name> (<version>)"
//   replaced -> "<code> | ... - Replace with <name> (<version>)"
const ISSUE_TITLE_RE = /^(\d{5})\s*\|.+(?:Update|Rework as|Replace with|Implement).+\((\d+\.\d+\.\d+)\)/i;

function toIssueData(issue: Issue): GithubIssueData {
    return {
        status: issue.state === "closed" ? "closed" : "open",
        issueUrl: issue.html_url,
        closedAt: issue.closed_at ? new Date(issue.closed_at) : null,
        created: new Date(issue.created_at),
        updated: new Date(issue.updated_at)
    };
}

// Fetches ALL repo issues (open + closed) into memory and builds lookup indexes.
// Call once before any card transformation — subsequent lookups are instant.
export async function loadAllIssues(): Promise<void> {
    if (issueIndex) return;

    const c = await getGithubClient();
    const owner = process.env.GITHUB_OWNER as string;
    const repo = process.env.GITHUB_REPOSITORY as string;

    const byNumber = new Map<number, GithubIssueData>();
    const byCardCodeVersion = new Map<string, GithubIssueData>();

    const progress = createProgress("Fetching issues");
    let page = 1;
    let total = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const { data } = await c.rest.issues.listForRepo({
            owner,
            repo,
            state: "all",
            per_page: 100,
            page
        });

        // issues.list returns PRs too; filter them out (PRs have a pull_request key)
        const issues = data.filter((i: any) => !i.pull_request);

        if (data.length === 0) break;

        for (const issue of issues) {
            const data = toIssueData(issue);
            byNumber.set(issue.number, data);

            const match = issue.title.match(ISSUE_TITLE_RE);
            if (match) {
                const key = `${match[1]}-${match[2]}`;
                // If multiple issues match the same card+version, prefer the closed one
                const existing = byCardCodeVersion.get(key);
                if (!existing || data.status === "closed") {
                    byCardCodeVersion.set(key, data);
                }
            }
        }

        total += issues.length;
        progress.counter(total, total, `page ${page}`);
        if (data.length < 100) break;
        page++;
    }

    progress.done(`${total} issues loaded (${byCardCodeVersion.size} matched to card codes)`);
    issueIndex = { byNumber, byCardCodeVersion };
}

// Look up a previously-fetched issue by its number (for cards that already have an issueUrl)
export function getIssueByNumber(issueNumber: number): GithubIssueData | null {
    return issueIndex?.byNumber.get(issueNumber) ?? null;
}

// Look up an issue by card code + version (for cards with no existing github data)
export function getIssueByCardCode(cardCode: string, version: string): GithubIssueData | null {
    return issueIndex?.byCardCodeVersion.get(`${cardCode}-${version}`) ?? null;
}

export function parseIssueNumber(issueUrl: string): number | null {
    const match = issueUrl.match(/\/issues\/(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
}

// ─── Pull Requests ────────────────────────────────────────────────────────────

export type GithubPR = {
    number: number;
    title: string;
    body: string | null;
    state: "open" | "closed";
    merged: boolean;
    mergedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    pullRequestUrl: string;
};

export async function fetchAllPullRequests(): Promise<GithubPR[]> {
    const c = await getGithubClient();
    const owner = process.env.GITHUB_OWNER as string;
    const repo = process.env.GITHUB_REPOSITORY as string;

    const results: GithubPR[] = [];
    const progress = createProgress("Fetching PRs");
    let page = 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const { data } = await c.rest.pulls.list({
            owner,
            repo,
            state: "all",
            per_page: 100,
            page
        });

        if (data.length === 0) break;

        for (const pr of data) {
            results.push({
                number: pr.number,
                title: pr.title,
                body: pr.body ?? null,
                state: pr.state === "closed" ? "closed" : "open",
                merged: !!pr.merged_at,
                mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
                createdAt: new Date(pr.created_at),
                updatedAt: new Date(pr.updated_at),
                pullRequestUrl: pr.html_url
            });
        }

        progress.counter(results.length, results.length, `page ${page}`);
        if (data.length < 100) break;
        page++;
    }

    progress.done(`${results.length} pull request(s) loaded`);
    return results;
}

// ─── PR description parsing ───────────────────────────────────────────────────

export const VALID_NOTE_TYPES = ["replaced", "updated", "reworked"] as const;
export type ValidNoteType = (typeof VALID_NOTE_TYPES)[number];

// Hardcoded emoji -> note type map; consistent across all PRs regardless of legend presence
const EMOJI_NOTE_TYPE_MAP: Record<string, ValidNoteType> = {
    ":twisted_rightwards_arrows:": "replaced",
    ":arrows_clockwise:": "reworked",
    ":arrow_double_up:": "updated"
};

export type ParsedCardChange = {
    projectNumber: number;
    cardNumber: number;
    cardCode: string;
    version: string;
    noteType: ValidNoteType;
    noteText: string;
};

const PR_TITLE_RE = /^(.+?)\s*\|\s*Playtesting Update\s+(\d+)$/i;

// Matches a card change heading. Version is required — entries without a semver are not card changes.
const CARD_CHANGE_RE = /^\*\*([^*]*?)\s*(\d{5})\s*\|\s*.+?\s+v(\d+\.\d+\.\d+)\*\*\s*$/;

export function parsePRTitle(title: string): { projectCode: string; updateNumber: number } | null {
    const match = title.match(PR_TITLE_RE);
    if (!match) return null;
    return {
        projectCode: match[1].trim(),
        updateNumber: parseInt(match[2], 10)
    };
}

export function parsePRBody(body: string, prNumber: number): ParsedCardChange[] {
    const changes: ParsedCardChange[] = [];

    // Section ends at the next heading, a horizontal rule (the "_Last Updated_" footer), or end of body
    const sectionMatch = body.match(/##\s+.*?Card Change Notes([\s\S]*?)(?=\n##\s+|\n-{3,}\s*\r?\n|$)/i);
    if (!sectionMatch) {
        log.verbose(`PR #${prNumber}: no 'Card Change Notes' section found`);
        return changes;
    }

    const section = sectionMatch[1];
    const lines = section.split("\n");
    let currentChange: { heading: RegExpMatchArray; lines: string[] } | null = null;

    const flushChange = () => {
        if (!currentChange) return;

        const headingMatch = currentChange.heading;
        const emojiStr = headingMatch[1].trim();
        const codeStr = headingMatch[2];
        const version = headingMatch[3];

        const projectNumber = parseInt(codeStr.slice(0, 2), 10);
        const rawCard = parseInt(codeStr.slice(2), 10);
        const cardNumber = rawCard >= 500 ? rawCard - 500 : rawCard;

        // Resolve note type from hardcoded emoji map — no legend dependency
        const emojisInHeading = [...emojiStr.matchAll(/:[a-z_]+:/g)].map((m) => m[0]);
        const resolvedTypes = emojisInHeading
            .map((e) => EMOJI_NOTE_TYPE_MAP[e])
            .filter((t): t is ValidNoteType => t !== undefined);

        if (resolvedTypes.length === 0) {
            // Only change-type emojis are in the map; if none resolved this is implemented-only
            log.verbose(`PR #${prNumber}: skipping implemented-only entry ${codeStr} v${version}`);
            currentChange = null;
            return;
        }

        const noteType: ValidNoteType = resolvedTypes[0];
        const noteText = currentChange.lines.join("\n").trim().replace(/\r/g, "");

        if (noteText) {
            changes.push({ projectNumber, cardNumber, cardCode: codeStr, version, noteType, noteText });
        } else {
            log.verbose(`PR #${prNumber}: no note text for ${codeStr} v${version} — skipping`);
        }

        currentChange = null;
    };

    for (const line of lines) {
        // Strip any check-marks & see if it matches
        const alteredLine = line.replace(":white_check_mark:", "");
        const headingMatch = alteredLine.match(CARD_CHANGE_RE);
        if (headingMatch) {
            flushChange();
            currentChange = { heading: headingMatch, lines: [] };
        } else if (currentChange) {
            currentChange.lines.push(line);
        }
    }
    flushChange();

    return changes;
}
