import { IProject } from "common/models/projects";
import { getMilestone } from "./milestones";
import type { Endpoints } from "@octokit/types";
import { IPlaytestCard } from "common/models/cards";
import { dataService, githubService, logger } from "@/services";
import { isInitial, parseCardCode } from "common/utils";
import { GithubContext } from ".";
import { syncImage } from "@/rendering/hosting";
import { emojis } from "./utils";
import { getTimeLockedImageUrl, pascalCase } from "@/utils";
import { createSyncEmitter } from "@/services/sseService";

type Issue = Endpoints["GET /repos/{owner}/{repo}/issues"]["response"]["data"][number];

export async function syncIssues(cards: IPlaytestCard[]) {

    const projects = await dataService.projects.read([...new Set(cards.map((card) => card.project))].map((number) => ({ number })));
    const context = githubService.getContext();

    // Contains cached issues, split by project number
    const cachedIssues: Record<number, Issue[]> = {};
    const getIssuesForProject = async (project: IProject) => {
        let issues = cachedIssues[project.number];
        if (!issues) {
            const milestone = await getMilestone(project);
            issues = await context.client.paginate(context.client.rest.issues.listForRepo, {
                owner: context.owner,
                repo: context.repo,
                milestone: milestone.toString(),
                labels: "automated",
                state: "all",
                per_page: 100
            });

            cachedIssues[project.number] = issues;
        }

        return issues;
    };

    const toUpdate: IPlaytestCard[] = [];
    let needsUpdate = false;
    for (let card of cards) {
        const emitter = createSyncEmitter("card", "github", `${card.project}|${card.number}|${card.version}`);
        try {
            emitter.start();
            const project = projects.find((project) => project.number === card.project);
            let isMissing = isIssueMissing(card);
            if (isMissing) {
                emitter.progress("Searching");
                // Fetches issues for project (from cache, or github)
                const projectIssues = await getIssuesForProject(project);
                const existingIssue = projectIssues.find((i) => i.title.includes(parseCardCode(false, card.project, card.number)) && i.title.includes(card.version));

                if (existingIssue) {
                    needsUpdate = true;
                    card.github = card.github ?? {};
                    card.github.issueUrl = existingIssue.html_url;
                    card.github.status = existingIssue.state as "open" | "closed";
                    if (existingIssue.closed_at) {
                        card.github.closedAt = new Date(existingIssue.closed_at);
                    }
                    card.github.lastSynced = new Date(existingIssue.updated_at);

                    isMissing = false;
                    logger.info(`[Github] Missing issue found & attached to ${card.name} (${card.version})`);
                }
            }
            if (isMissing || isIssueOutdated(card)) {
                needsUpdate = true;
                emitter.progress("Syncing");
                if (isInitial(card)) {
                    card = await syncInitial(card, project);
                } else {
                    switch (card.note?.type) {
                        case "updated": {
                            card = await syncUpdate(card, project);
                            break;
                        }
                        case "reworked": {
                            card = await syncRework(card, project);
                            break;
                        }
                        case "replaced": {
                            card = await syncReplace(card, project);
                            break;
                        }
                        default: {
                            logger.warn(`Attempted to sync issue for ${card.name} (${card.version}) with missing note type`);
                        }
                    }
                }
            }
            toUpdate.push(card);
            emitter.complete(card);
        } catch (err) {
            emitter.error("Failure");
            logger.warn(new Error(`[Github] Failed to sync ${card.name} (${card.version})`, { cause: err }));
        }
    }

    if (needsUpdate) {
        cards = await dataService.cards.update(toUpdate, false, false);
    }
    return cards;
}
export async function clearIssues(cards: IPlaytestCard[]) {
    const context = githubService.getContext();
    for (const card of cards) {
        try {
            if (!isIssueMissing(card)) {
                const { issueNumber } = extractFromURL(card.github.issueUrl);
                const { data: issue } = await context.client.rest.issues.get({ issue_number: issueNumber, owner: context.owner, repo: context.repo });
                await context.client.graphql(
                    `mutation DeleteIssue($issueId: ID!) {
                        deleteIssue(input: { issueId: $issueId }) {
                            repository {
                                id
                            }
                        }
                    }`,
                    { issueId: issue.node_id }
                );

                delete card.github;
            }
        } catch (err) {
            logger.warn(new Error(`[Github] Failed to clear issue for ${card.name} (${card.version})`, { cause: err }));
        }
    }

    return cards;
}

/**
 * Syncs initial cards (eg. to implement)
 */
async function syncInitial(card: IPlaytestCard, project: IProject, context?: GithubContext) {
    logger.info(`[Github] Syncing "initial" issue for ${card.name} (${card.version})`);
    try {
        context = context ?? githubService.getContext();
        if (!isInitial(card)) {
            new Error("Card must be initial version");
        }
        card = await syncImage(card);

        const details = await issues.initial(card, project, context);
        card = await internalSync(card, details, context);
        return card;
    } catch (err) {
        throw new Error(`Error syncing issue for ${card.name} (${card.version})`, { cause: err });
    }
}
/**
 * Syncs cards with a "updated" note type
 */
async function syncUpdate(card: IPlaytestCard, project: IProject, context?: GithubContext) {
    logger.info(`[Github] Syncing "update" issue for ${card.name} (${card.version})`);
    try {
        context = context ?? githubService.getContext();
        if (card.note?.type !== "updated") {
            new Error("Card must have a note type of \"updated\"");
        }
        card = await syncImage(card);
        let previous = await dataService.cards.previous(card);
        previous = await dataService.cards.sync(previous);

        const details = await issues.updated(card, previous, project, context);
        card = await internalSync(card, details, context);

        return card;
    } catch (err) {
        throw new Error(`Error syncing issue for ${card.name} (${card.version})`, { cause: err });
    }
}
/**
 * Syncs cards with a "reworked" note type
 */
async function syncRework(card: IPlaytestCard, project: IProject, context?: GithubContext) {
    logger.info(`[Github] Syncing "rework" issue for ${card.name} (${card.version})`);
    try {
        context = context ?? githubService.getContext();
        if (card.note?.type !== "reworked") {
            new Error("Card must have a note type of \"reworked\"");
        }
        card = await syncImage(card);
        let previous = await dataService.cards.previous(card);
        previous = await dataService.cards.sync(previous);

        const details = await issues.reworked(card, previous, project, context);
        card = await internalSync(card, details, context);

        return card;
    } catch (err) {
        throw new Error(`Error syncing issue for ${card.name} (${card.version})`, { cause: err });
    }
}
/**
 * Syncs cards with a "replaced" note type
 */
async function syncReplace(card: IPlaytestCard, project: IProject, context?: GithubContext) {
    logger.info(`[Github] Syncing "replace" issue for ${card.name} (${card.version})`);
    try {
        context = context ?? githubService.getContext();
        if (card.note?.type !== "replaced") {
            new Error("Card must have a note type of \"replaced\"");
        }
        card = await syncImage(card);
        let previous = await dataService.cards.previous(card);
        previous = await dataService.cards.sync(previous);

        const details = await issues.replaced(card, previous, project, context);
        card = await internalSync(card, details, context);

        return card;
    } catch (err) {
        throw new Error(`Error syncing issue for ${card.name} (${card.version})`, { cause: err });
    }
}

/**
 * Handles internal logic for creating or updating an issue for a card, if appropriate.
 */
async function internalSync(card: IPlaytestCard, details: { title: string, body: string, labels: string[], milestone: number, owner: string, repo: string }, context: GithubContext) {
    if (isIssueMissing(card)) {
        const { data: issue } = await context.client.rest.issues.create(details);
        logger.info(`[Github] Created issue #${issue.number} for ${card.name} (${card.version})`);
        card.github = {
            issueUrl: issue.html_url,
            status: issue.state as "open" | "closed",
            lastSynced: new Date()
        };
    } else {
        const { issueNumber } = extractFromURL(card.github.issueUrl);
        const { data: issue } = await context.client.rest.issues.update({ issue_number: issueNumber, ...details });
        logger.info(`[Github] Updated issue #${issue.number} for ${card.name} (${card.version})`);
        card.github.status = issue.state as "open" | "closed";
        if (issue.closed_at) {
            card.github.closedAt = new Date(issue.closed_at);
        }
        card.github.lastSynced = new Date();
    }
    return card;
}

function isIssueMissing(card: IPlaytestCard) {
    return !card.github?.issueUrl;
}
function isIssueOutdated(card: IPlaytestCard) {
    return !card.github?.lastSynced || card.updated > card.github.lastSynced;
}

function extractFromURL(url: string) {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
    if (!match) throw new Error(`Invalid GitHub issue URL: ${url}`);
    return { owner: match[1], repo: match[2], issueNumber: parseInt(match[3], 10) };
}

const issues = {
    async initial(card: IPlaytestCard, project: IProject, context: GithubContext) {
        const imageUrl = getTimeLockedImageUrl(card);
        const title = `${card.code} | ${project.code} - Implement ${card.name} (${card.version})`;
        const milestone = await getMilestone(project);
        const body = `## :memo: Implementation requested for ${card.name} (${project.code})`
            + "\n\n### What needs to be done?"
            + "\nNew card needs to be added to this repository, which will require a card file to be created and potentially code implementation."
            + `\n\n![image](${imageUrl})`
            + "\n\n---"
            + "\n\n### Implementation Steps"
            + "\n1. Create a branch from `development` (you may use a single branch for multiple implementations/updates)."
            + `\n2. Create & implement \`server/game/cards/${project.code}/${pascalCase(card.name)}.js\` based on above card.`
            + `\n3. Within \`${pascalCase(card.name)}.js\`, add version underneath card code at bottom of file (\`${pascalCase(card.name)}.version = '${card.version}';\`).`
            + "\n4. (Optional) Local testing. Test files are not required for playtesting."
            + "\n5. When ready, create a pull request into `development` branch, add `Closes: #[this issue number]` in the description, and await approval/merging."
            + "\n\n---"
            + "\n\n_:robot: Issue was automatically created, and will close itself when card implementation is pushed to the playtesting website._";
        const labels = ["automated", "implement-card"];

        return { title, body, labels, milestone, owner: context.owner, repo: context.repo };
    },
    async updated(card: IPlaytestCard, previous: IPlaytestCard, project: IProject, context: GithubContext) {
        const imageUrl = getTimeLockedImageUrl(card);
        const previousImageUrl = getTimeLockedImageUrl(previous);
        const title = `${card.code} | ${project.code} - Update ${card.name} (${card.version})`;
        const milestone = await getMilestone(project);
        const body = `## :memo: Update requested for ${card.name} (${project.code})`
            + "\n\n### What needs to be done?"
            + "\nUpdate this cards version and, if there are non-keyword textbox changes, update the card's code."
            + "\n\nPrevious Version | New Version"
            + "\n:-------------------------:|:-------------------------:"
            + `\n![image](${previousImageUrl}) |![image](${imageUrl})`
            + "\n\n### Change Notes"
            + `\n${emojis[card.note!.type]} **${pascalCase(card.note!.type)}** - ${card.note!.text}`
            + "\n\n---"
            + "\n\n### Implementation Steps"
            + "\n1. Create a branch from `development` (you may use a single branch for multiple implementations/updates)."
            + `\n2. Update \`server/game/cards/${project.code}/${pascalCase(card.name)}.js\` to match the new version (if applicable).`
            + `\n3. Within \`${pascalCase(card.name)}.js\`, update version underneath card code at bottom of file (\`${pascalCase(card.name)}.version = '${card.version}';\`).`
            + "\n4. (Optional) Local testing. Test files are not required for playtesting."
            + "\n5. When ready, create a pull request into `development` branch, add `Closes: #[this issue number]` in the description, and await approval/merging."
            + "\n\n---"
            + "\n\n_:robot: Issue was automatically created, and will close itself when card implementation is pushed to the playtesting website._";
        const labels = ["automated", "update-card"];
        if (!previous.implemented) {
            labels.push("implement-card");
        }
        return { title, body, labels, milestone, owner: context.owner, repo: context.repo };
    },
    async reworked(card: IPlaytestCard, previous: IPlaytestCard, project: IProject, context: GithubContext) {
        // Same template for updated & reworked, except title
        const title = `${card.code} | ${project.code} - Rework ${card.name} (${card.version})`;
        const { body, labels, milestone, owner, repo } = await issues.updated(card, previous, project, context);
        return { title, body, labels, milestone, owner, repo };
    },
    async replaced(card: IPlaytestCard, previous: IPlaytestCard, project: IProject, context: GithubContext) {
        const imageUrl = getTimeLockedImageUrl(card);
        const previousImageUrl = getTimeLockedImageUrl(previous);
        const title = `${card.code} | ${project.code} - Replace with ${card.name} (${card.version})`;
        const milestone = await getMilestone(project);
        const body = `## :memo: Replacement requested to ${card.name} (${project.code})`
            + "\n\n### What needs to be done?"
            + "\nPrevious card should be deleted, and replacement card needs to be added to this repository, which will require a card file to be created and potentially code implementation."
            + "\n\nPrevious Card | Replacement Card"
            + "\n:-------------------------:|:-------------------------:"
            + `\n![image](${previousImageUrl}) |![image](${imageUrl})`
            + "\n\n### Change Notes"
            + `\n${emojis[card.note!.type]} **${pascalCase(card.note!.type)}** - ${card.note!.text}`
            + "\n\n---"
            + "\n\n### Implementation Steps"
            + "\n1. Create a branch from `development` (you may use a single branch for multiple implementations/updates)."
            + `\n2. Delete \`server/game/cards/${project.code}/${pascalCase(previous.name)}.js\`, and any external code which was created explicitly for it (eg. new effects).`
            + `\n3. Create & implement \`server/game/cards/${project.code}/${pascalCase(card.name)}.js\` based on replacement card.`
            + `\n4. Within \`${pascalCase(card.name)}.js\`, add version underneath card code at bottom of file (\`${pascalCase(card.name)}.version = '${card.version}';\`).`
            + "\n5. (Optional) Local testing. Test files are not required for playtesting."
            + "\n6. When ready, create a pull request into `development` branch, add `Closes: #[this issue number]` in the description, and await approval/merging."
            + "\n\n---"
            + "\n\n_:robot: Issue was automatically created, and will close itself when card implementation is pushed to the playtesting website._";
        const labels = ["automated", "update-card"];
        if (!previous.implemented) {
            labels.push("implement-card");
        }
        return { title, body, labels, milestone, owner: context.owner, repo: context.repo };
    }
};