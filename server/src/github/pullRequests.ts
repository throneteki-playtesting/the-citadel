import { dataService, githubService, logger } from "@/services";
import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { GithubContext } from ".";
import { IPlaytestCard, NoteType } from "common/models/cards";
import { emojis } from "./utils";
import { parseCardCode } from "common/utils";
import { sortBy } from "lodash-es";
import { Endpoints } from "@octokit/types";

type PullRequest = Endpoints["GET /repos/{owner}/{repo}/pulls"]["response"]["data"][number];

export async function syncPullRequests() {
    let playtestingUpdates = await dataService.playtestingUpdates.read([{ github: { status: null } }, { github: { status: "open" } }]);
    const newlyImplemented = await dataService.cards.read({ github: { status: "closed" }, implemented: false });
    const context = githubService.getContext();

    const needsPullRequest = playtestingUpdates.length > 0 || newlyImplemented.length > 0;
    const canCreatePullRequest = await isPlaytestingBranchBehind(context);
    if (!canCreatePullRequest) {
        // Skip pull request sync as no commits can be merged
        return playtestingUpdates;
    }
    try {
        const { data: [existingPR] } = await context.client.rest.pulls.list({
            owner: context.owner,
            repo: context.repo,
            head: `${context.owner}:development`,
            base: "playtesting",
            state: "open"
        });
        if (needsPullRequest) {
            if (isPROutdated(existingPR, playtestingUpdates, newlyImplemented)) {
                const { syncedAt, url, status, mergedAt } = await internalSync(existingPR, playtestingUpdates, newlyImplemented, context);
                const toUpdate: IPlaytestingUpdate[] = [];
                for (const playtestingUpdate of playtestingUpdates) {
                    playtestingUpdate.github = {
                        pullRequestUrl: url,
                        mergedAt,
                        status,
                        lastSynced: syncedAt
                    };
                    toUpdate.push(playtestingUpdate);
                }
                playtestingUpdates = await dataService.playtestingUpdates.update(toUpdate, false, false);
            }
        } else if (existingPR) {
            logger.info(`[Github] Closing pull request #${existingPR.number} as no latest playtesting changes exist`);
            await context.client.rest.pulls.update({
                owner: context.owner,
                repo: context.repo,
                pull_number: existingPR.number,
                state: "closed"
            });
        }
    } catch (err) {
        logger.warn(new Error("[Github] Failed to sync playtesting pull request", { cause: err }));
    }
    return playtestingUpdates;
}

function isPROutdated(pullRequest: PullRequest | undefined, playtestingUpdates: IPlaytestingUpdate[], newlyImplemented: IPlaytestCard[]) {
    if (!pullRequest) {
        return true;
    }
    const prUpdatedAt = new Date(pullRequest.updated_at);
    const outdated = playtestingUpdates.some((pu) => !pu.github?.lastSynced || pu.updated > pu.github.lastSynced) || newlyImplemented.some((ni) => ni.updated > prUpdatedAt);
    if (outdated) {
        return true;
    }

    // Final "expensive" check to scan the list of implemented codes and compare to newly implemented
    const existingCodes = extractImplementedCodes(pullRequest);
    const newCodes = newlyImplemented.map(card => parseCardCode(!!card.release, card.project, card.release ? card.release.number : card.number) as string);
    return existingCodes.length !== newCodes.length || existingCodes.some(code => !newCodes.includes(code));
}

async function isPlaytestingBranchBehind(context: GithubContext) {
    const { data } = await context.client.rest.repos.compareCommitsWithBasehead({
        owner: context.owner,
        repo: context.repo,
        basehead: "playtesting...development"
    });

    return data.total_commits > 0;
}

async function internalSync(existingPR: PullRequest | undefined, playtestingUpdates: IPlaytestingUpdate[], newlyImplemented: IPlaytestCard[], context: GithubContext) {
    const details = await pullRequests.playtesting(playtestingUpdates, newlyImplemented, context);
    if (!existingPR) {
        const { data } = await context.client.rest.pulls.create(details);
        logger.info(`[Github] Created pull request #${data.number} for latest playtesting changes`);
        return {
            syncedAt: new Date(),
            url: data.html_url,
            status: data.state as "open" | "closed",
            mergedAt: new Date(data.merged_at)
        };
    } else {
        const { data } = await context.client.rest.pulls.update({ pull_number: existingPR.number, ...details });
        logger.info(`[Github] Updated pull request #${data.number} for latest playtesting changes`);
        return {
            syncedAt: new Date(),
            url: data.html_url,
            status: data.state as "open" | "closed",
            mergedAt: new Date(data.merged_at)
        };
    }
}

function extractImplementedCodes(pullRequest: PullRequest) {
    const implementedSection = pullRequest.body?.split(/## .* Implemented Cards/)[1] ?? "";
    const CODE_COLUMN_PATTERN = /^\|[^|]+\|\s*([^|]+?)\s*\|/gm;
    const codes = [...implementedSection.matchAll(CODE_COLUMN_PATTERN)]
        .filter(match => !match[0].startsWith("|--") && !match[0].includes("Code"))
        .map(match => match[1].trim());

    return codes;
}

const pullRequests = {
    async playtesting(playtestingUpdates: IPlaytestingUpdate[], newlyImplemented: IPlaytestCard[], context: GithubContext) {
        const date = new Date();
        const version = `${date.getFullYear().toString().slice(-2)}.${date.getMonth() + 1}.${date.getDate()}`;

        const projectChanges = await buildProjectChanges(playtestingUpdates);
        const implementedCards = await buildImplementedCards(newlyImplemented);

        const title = `Website Update ${version}`;
        const body = `# ${emojis.announcement} Playtesting Website Update ${version}`
        + "\nApplies the latest updates to [playtesting.theironthrone.net](https://playtesting.theironthrone.net), which may contain new playtesting content, updated playtesting content and/or bug fixes. Not all changes are documented in this PR, and adjustments should be considered unstable."
        + "\n\n> [!WARNING]"
        + "\n> Code implemented for playtesting should always be treated as unstable. Expect bugs, and kindly report them to the [discord bugs forum](https://discord.com/channels/698308957822779462/1343356199244005466) with as much detail as possible."
        + "\n\n"
        + projectChanges
        + implementedCards;

        const labels = ["automated", "playtest-update"];
        const head = `${context.owner}:development`;
        const base = "playtesting";
        return { title, body, labels, owner: context.owner, repo: context.repo, head, base };
    }
};


async function buildImplementedCards(cards: IPlaytestCard[]) {
    if (cards.length === 0) {
        return "";
    }
    cards = sortBy(cards, ["project", "number"]);

    const projects = await dataService.projects.read([... new Set(cards.map((card) => card.project))].map((project) => ({ number: project })));
    const projectMap = projects.reduce<Record<number, IProject>>((map, project) => {
        map[project.number] = map[project.number] ?? project;
        return map;
    }, {});

    const rows: string[] = [];
    for (const card of cards) {
        const project = projectMap[card.project];
        const row = `\n| :${project.emoji}: ${project.code} | ${parseCardCode(!!card.release, card.project, card.release ? card.release.number : card.number)} | ${card.name} | ${card.version} |`;
        rows.push(row);
    }

    return `## ${emojis.implemented} Implemented Cards`
        + "\nThe following cards were implemented; they may or may not be part of a project update."
        + "\n\n| Project | Code | Name | Version |"
        + "\n|--------|--------|--------|--------|"
        + rows;
}

async function buildProjectChanges(playtestingUpdates: IPlaytestingUpdate[]) {
    const projectChanges: string[] = [];
    for (const playtestingUpdate of playtestingUpdates) {
        const [project] = await dataService.projects.read({ number: playtestingUpdate.project });
        const title = `:${project.emoji}: ${project.name} - Playtesting Update ${playtestingUpdate.version}`;
        const summary = await buildCardChangeSummary(playtestingUpdate);
        const link = ` _**[Click for more details](${process.env.CLIENT_HOST}/project/${playtestingUpdate.project}/update/${playtestingUpdate.version})**_`;
        projectChanges.push([title, summary, link].join("\n"));
    }

    if (projectChanges.length === 0) {
        return "";
    }
    return "## Project Changes"
        + `\n${projectChanges.join("\n\n##\n\n")}`
        + "\n\n##\n\n";
}

async function buildCardChangeSummary(playtestingUpdate: IPlaytestingUpdate) {
    const types: NoteType[] = ["updated", "reworked", "replaced"] as const;
    const typeCounts = {
        updated: 0,
        reworked: 0,
        replaced: 0
    };

    let implementedCount = 0;

    const cards = await dataService.cards.forUpdate(playtestingUpdate);

    for (const card of cards) {
        if (card.note?.type in typeCounts) {
            typeCounts[card.note.type]++;
        }
        // Recently implemented cards will be closed, but not marked as implemented yet
        // Implemented is set to true on successful merge
        if (card.github?.status === "closed" && card.implemented === false) {
            implementedCount++;
        }
    }
    const typeLines = types
        .filter(type => typeCounts[type] > 0)
        .map(type => {
            const count = typeCounts[type];
            const label = count === 1 ? "card" : "cards";
            return `${emojis[type]} ${count} ${label} ${type}`;
        });

    const implementedLine = `${emojis.implemented} ${implementedCount}/${cards.length} cards in this update were implemented.`;

    return [...typeLines, "", implementedLine].join("\n");
}