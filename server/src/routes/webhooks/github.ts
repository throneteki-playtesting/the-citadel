import express from "express";
import asyncHandler from "express-async-handler";
import { StatusCodes } from "http-status-codes";
import { IssuesReopenedEvent, Label, type IssuesClosedEvent, type IssuesDeletedEvent, type PullRequestClosedEvent, type PushEvent } from "@octokit/webhooks-types";
import { dataService, githubService, logger } from "@/services";
import { githubWebhookMiddleware } from "@/middleware/auth";
import { createSyncEmitter } from "@/services/sseService";
import { merge } from "lodash-es";
import { syncCodePullRequests } from "@/github/pullRequests";

const router = express.Router();

router.use(githubWebhookMiddleware);

router.post("/issue",
    asyncHandler(async (req, res) => {
        const event = req.body;

        if (isIssuesClosedEvent(event)) {
            await onIssueClosed(event);
        } else if (isIssuesReopenedEvent(event)) {
            await onIssueReopened(event);
        } else if (isIssuesDeletedEvent(event)) {
            await onIssueDeleted(event);
        }

        res.sendStatus(StatusCodes.OK);
    })
);

async function onIssueClosed({ issue }: IssuesClosedEvent) {
    if (!isAutomated(issue)) {
        return;
    }

    logger.info(`[Github] Webhook recieved for issue ${issue.title} (#${issue.number}) closing`);

    let cards = await dataService.cards.read({ _metadata: { github: { issueUrl: issue.html_url } } });
    if (cards.length > 0) {
        const lastSynced = new Date();
        for (const card of cards) {
            const emitter = createSyncEmitter("card", "github", card);
            emitter.start();
            merge(card, { _metadata: { github: { status: issue.state, ...(issue.closed_at && { closedAt: new Date(issue.closed_at) }), lastSynced } } });
            emitter.complete(card);
        }
        cards = await dataService.cards.update(cards, false, false);

        logger.info(`[Github] Updated github data for ${cards.length} cards`);
    }
}

async function onIssueReopened({ issue }: IssuesReopenedEvent) {
    if (!isAutomated(issue)) {
        return;
    }

    logger.info(`[Github] Webhook recieved for issue ${issue.title} (#${issue.number}) re-opening`);

    let cards = await dataService.cards.read({ _metadata: { github: { issueUrl: issue.html_url } } });
    if (cards.length > 0) {
        const lastSynced = new Date();
        for (const card of cards) {
            const emitter = createSyncEmitter("card", "github", card);
            emitter.start();
            delete card._metadata?.github?.closedAt;
            merge(card, { _metadata: { github: { status: issue.state, lastSynced } } });
            emitter.complete(card);
        }
        cards = await dataService.cards.update(cards, false, false);

        logger.info(`[Github] Updated github data for ${cards.length} cards`);
    }
}

async function onIssueDeleted({ issue }: IssuesDeletedEvent) {
    // Note: Deleted issues have no labels, likely removed by github before this event, so cannot check for "automated"

    logger.info(`[Github] Webhook recieved for issue ${issue.title} (#${issue.number}) being deleted`);

    let cards = await dataService.cards.read({ _metadata: { github: { issueUrl: issue.html_url } } });
    if (cards.length > 0) {
        for (const card of cards) {
            const emitter = createSyncEmitter("card", "github", card);
            emitter.start();
            if (card._metadata) {
                delete card._metadata.github;
            }
            emitter.complete(card);
        }
        cards = await dataService.cards.update(cards, false, false);

        logger.info(`[Github] Deleted github data for ${cards.length} cards`);
    }
}

router.post("/push",
    asyncHandler(async (req, res) => {
        const event = req.body;

        if (isPushEvent(event) && event.ref === "refs/heads/development") {
            await onDevelopmentPush(event);
        }

        res.sendStatus(StatusCodes.OK);
    })
);

async function onDevelopmentPush({ commits }: PushEvent) {
    logger.info(`[Github] Webhook recieved for ${commits.length} commit(s) pushed to development`);

    const playtestingUpdates = await dataService.playtestingUpdates.read([{ _metadata: { github: { code: { status: null } } } }, { _metadata: { github: { code: { status: "open" } } } }]);
    await syncCodePullRequests(playtestingUpdates);

    logger.info("[Github] Synced pull requests after push to development");
}

router.post("/pull-request",
    asyncHandler(async (req, res) => {
        const event = req.body;

        if (isPullRequestClosedEvent(event)) {
            onPullRequestClosed(event);
        }

        res.sendStatus(StatusCodes.OK);
    })
);

async function onPullRequestClosed({ pull_request: pullRequest }: PullRequestClosedEvent) {
    const isMerged = pullRequest.merged;
    logger.info(`[Github] Webhook recieved for pull request ${pullRequest.title} (#${pullRequest.number}) being closed${isMerged ? " & merged" : ""}`);

    if (isAutomated(pullRequest)) {
        const lastSynced = new Date();
        await syncPlaytestingUpdatePR(pullRequest, "code", isMerged, lastSynced);
        await syncPlaytestingUpdatePR(pullRequest, "data", isMerged, lastSynced);
    } else if (isMerged && pullRequest.base.ref === "development") {
        // For regular Pull Requests into development, check any "closing" issues mentioned and manually close them
        const issueNumbers = extractClosedIssueNumbers(pullRequest.body ?? "");
        if (issueNumbers.length > 0) {
            const { client, owner, repo } = githubService.getContext();

            await Promise.all(issueNumbers.map(issueNumber =>
                client.rest.issues.update({
                    owner,
                    repo,
                    issue_number: issueNumber,
                    state: "closed"
                })
            ));

            logger.info(`[Github] Closed ${issueNumbers.length} issues referenced in PR #${pullRequest.number}`);
        }
    }
}

async function syncPlaytestingUpdatePR(pullRequest: PullRequestClosedEvent["pull_request"], key: "code" | "data", isMerged: boolean, lastSynced: Date) {
    const operation = `github.${key}` as const;
    let updates = await dataService.playtestingUpdates.read({ _metadata: { github: { [key]: { pullRequestUrl: pullRequest.html_url } } } });
    if (updates.length === 0) return;

    for (const playtestingUpdate of updates) {
        const emitter = createSyncEmitter("playtestingUpdate", operation, playtestingUpdate);
        emitter.start();
        if (isMerged) {
            merge(playtestingUpdate, { _metadata: { github: { [key]: { status: pullRequest.state, mergedAt: new Date(pullRequest.merged_at), lastSynced } } } });
        } else if (playtestingUpdate._metadata?.github) {
            delete playtestingUpdate._metadata.github[key];
        }
        emitter.complete(playtestingUpdate);
    }
    updates = await dataService.playtestingUpdates.update(updates, false, false);
    logger.info(`[Github] ${isMerged ? "Updated" : "Deleted"} github.${key} data for ${updates.length} playtesting updates`);
}

function isAutomated(data: { labels?: Label[] }) {
    return data.labels && data.labels.some((label) => label.name === "automated");
}

function isIssuesClosedEvent(event: unknown): event is IssuesClosedEvent {
    return event && event["action"] === "closed" && !!event["issue"];
}

function isIssuesReopenedEvent(event: unknown): event is IssuesReopenedEvent {
    return event && event["action"] === "reopened" && !!event["issue"];
}

function isIssuesDeletedEvent(event: unknown): event is IssuesDeletedEvent {
    return event && event["action"] === "deleted" && !!event["issue"];
}

function isPushEvent(event: unknown): event is PushEvent {
    return event && "ref" in (event as object) && "commits" in (event as object);
}

function isPullRequestClosedEvent(event: unknown): event is PullRequestClosedEvent {
    return event && event["action"] === "closed" && !!event["pull_request"];
}

const CLOSES_PATTERN = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)[:\s]+#(\d+)/gi;
function extractClosedIssueNumbers(body: string): number[] {
    const matches = [...body.matchAll(CLOSES_PATTERN)];
    return matches.map(match => parseInt(match[1]));
}

export default router;