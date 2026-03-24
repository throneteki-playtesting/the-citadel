import express from "express";
import asyncHandler from "express-async-handler";
import { StatusCodes } from "http-status-codes";
import { IssuesReopenedEvent, Label, type IssuesClosedEvent, type IssuesDeletedEvent, type PullRequestClosedEvent } from "@octokit/webhooks-types";
import { dataService, githubService, logger } from "@/services";
import { authGithubWebhook } from "@/middleware/auth";
import { contextMiddleware } from "@/middleware/context";

const router = express.Router();

router.use(authGithubWebhook);
router.use(contextMiddleware);

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

        res.status(StatusCodes.OK);
    })
);

async function onIssueClosed({ issue }: IssuesClosedEvent) {
    if (!isAutomated(issue)) {
        return;
    }

    logger.info(`[Github] Webhook recieved for issue ${issue.title} (#${issue.number}) closing`);

    let cards = await dataService.cards.read({ github: { issueUrl: issue.html_url } });
    if (cards.length > 0) {
        const lastSynced = new Date();
        for (const card of cards) {
            card.github.status = issue.state;
            card.github.lastSynced = lastSynced;
        }
        cards = await dataService.cards.update(cards, false);
        // TODO: Trigger SSE to client

        logger.info(`[Github] Updated github data for ${cards.length} cards`);
    }
}

async function onIssueReopened({ issue }: IssuesReopenedEvent) {
    if (!isAutomated(issue)) {
        return;
    }

    logger.info(`[Github] Webhook recieved for issue ${issue.title} (#${issue.number}) re-opening`);

    let cards = await dataService.cards.read({ github: { issueUrl: issue.html_url } });
    if (cards.length > 0) {
        const lastSynced = new Date();
        for (const card of cards) {
            card.github.status = issue.state;
            card.github.lastSynced = lastSynced;
        }
        cards = await dataService.cards.update(cards, false);
        // TODO: Trigger SSE to client

        logger.info(`[Github] Updated github data for ${cards.length} cards`);
    }
}

async function onIssueDeleted({ issue }: IssuesDeletedEvent) {
    // Note: Deleted issues have no labels, likely removed by github before this event, so cannot check for "automated"

    logger.info(`[Github] Webhook recieved for issue ${issue.title} (#${issue.number}) being deleted`);

    let cards = await dataService.cards.read({ github: { issueUrl: issue.html_url } });
    if (cards.length > 0) {
        for (const card of cards) {
            delete card.github;
        }
        cards = await dataService.cards.update(cards, false);
        // TODO: Trigger SSE to client

        logger.info(`[Github] Deleted github data for ${cards.length} cards`);
    }
}

router.post("/pull-request",
    asyncHandler(async (req, res) => {
        const event = req.body;

        if (isPullRequestClosedEvent(event)) {
            onPullRequestClosed(event);
        }

        res.status(StatusCodes.OK);
    })
);

async function onPullRequestClosed({ pull_request: pullRequest }: PullRequestClosedEvent) {
    const isMerged = pullRequest.merged;
    logger.info(`[Github] Webhook recieved for pull request ${pullRequest.title} (#${pullRequest.number}) being closed${isMerged ? " & merged" : ""}`);

    if (isAutomated(pullRequest)) {
        let playtestingUpdates = await dataService.playtestingUpdates.read({ github: { pullRequestUrl: pullRequest.html_url } });
        if (playtestingUpdates.length > 0) {
            const lastSynced = new Date();
            for (const playtestingUpdate of playtestingUpdates) {
                if (isMerged) {
                    playtestingUpdate.github.status = pullRequest.state;
                    playtestingUpdate.github.mergedAt = new Date(pullRequest.merged_at);
                    playtestingUpdate.github.lastSynced = lastSynced;
                } else {
                    delete playtestingUpdate.github;
                }
            }
            playtestingUpdates = await dataService.playtestingUpdates.update(playtestingUpdates, false);
            // TODO: Trigger SSE to client

            logger.info(`[Github] ${isMerged ? "Updated" : "Deleted"} github data for ${playtestingUpdates.length} playtesting updates`);
        }
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

function isPullRequestClosedEvent(event: unknown): event is PullRequestClosedEvent {
    return event && event["action"] === "closed" && !!event["pull_request"];
}

const CLOSES_PATTERN = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)[:\s]+#(\d+)/gi;
function extractClosedIssueNumbers(body: string): number[] {
    const matches = [...body.matchAll(CLOSES_PATTERN)];
    return matches.map(match => parseInt(match[1]));
}

export default router;