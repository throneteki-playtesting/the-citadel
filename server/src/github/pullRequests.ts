import { dataService, githubService, logger } from "@/services";
import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { GithubContext } from ".";
import { IPlaytestCard, NoteType } from "common/models/cards";
import { syncImage } from "@/rendering/hosting";
import { emojis } from "./utils";
import { parseCardCode } from "common/utils";
import { merge, sortBy } from "lodash-es";
import { Endpoints } from "@octokit/types";
import { createSyncEmitter, SyncEmitter } from "@/services/sseService";

type PullRequest = Endpoints["GET /repos/{owner}/{repo}/pulls"]["response"]["data"][number];

let syncPullRequestsLock: Promise<void> = Promise.resolve();

export async function syncPullRequests() {
    const wait = syncPullRequestsLock;
    let release!: () => void;
    syncPullRequestsLock = new Promise(resolve => { release = resolve; });
    await wait;

    let failed = false;
    try {
        let playtestingUpdates = await dataService.playtestingUpdates.read([{ _metadata: { github: { status: null } } }, { _metadata: { github: { status: "open" } } }]);
        const newlyImplemented = await dataService.cards.read({ _metadata: { github: { status: "closed" } }, implemented: false });
        const context = githubService.getContext();

        const emitters: Map<IPlaytestingUpdate, SyncEmitter<"playtestingUpdate">> = new Map(playtestingUpdates.map((pt) => [pt, createSyncEmitter("playtestingUpdate", "github", pt)]));
        emitters.forEach((e) => e.start());

        const canCreatePullRequest = await isPlaytestingBranchBehind(context);
        if (canCreatePullRequest) {
            try {
                emitters.forEach((e) => e.progress("Searching"));
                const { data: [existingPR] } = await context.client.rest.pulls.list({
                    owner: context.owner,
                    repo: context.repo,
                    head: `${context.owner}:development`,
                    base: "playtesting",
                    state: "open"
                });

                const needsPullRequest = playtestingUpdates.length > 0 || newlyImplemented.length > 0;
                if (needsPullRequest) {
                    if (isPROutdated(existingPR, playtestingUpdates, newlyImplemented)) {
                        emitters.forEach((e) => e.progress("Syncing"));
                        const { syncedAt, url, status, mergedAt } = await internalSync(existingPR, playtestingUpdates, newlyImplemented, context);
                        const toUpdate: IPlaytestingUpdate[] = [];
                        for (const playtestingUpdate of playtestingUpdates) {
                            merge(playtestingUpdate, { _metadata: { github: { pullRequestUrl: url, mergedAt, status, lastSynced: syncedAt } } });
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
                failed = true;
                logger.warn(new Error("[Github] Failed to sync playtesting pull request", { cause: err }));
            }
        }

        // Attempt to sync json-data repository based on projects being updated
        try {
            emitters.forEach((e) => e.progress("Syncing Data"));
            await syncDataPullRequest(playtestingUpdates);
        } catch (err) {
            failed = true;
            logger.warn(new Error("[Github] Failed to sync data pull request", { cause: err }));
        }

        if (failed) {
            emitters.forEach((e) => e.error("Failure"));
        } else {
            emitters.forEach((e, pt) => e.complete(pt));
        }

        return playtestingUpdates;
    } finally {
        release();
    }
}

let syncDataPullRequestLock: Promise<void> = Promise.resolve();

async function syncDataPullRequest(playtestingUpdates: IPlaytestingUpdate[]) {
    const wait = syncDataPullRequestLock;
    let release!: () => void;
    syncDataPullRequestLock = new Promise(resolve => { release = resolve; });
    await wait;
    try {
        const context = githubService.getContext("data");
        const DATA_BRANCH = "development-updating";
        const BASE_BRANCH = "development";

        const [branchRef, existingPR] = await Promise.all([
            context.client.rest.git.getRef({ owner: context.owner, repo: context.repo, ref: `heads/${DATA_BRANCH}` }).then(r => r.data).catch(() => null),
            getDataOpenPR(context, DATA_BRANCH, BASE_BRANCH)
        ]);

        const updatingProjects = await dataService.projects.read([...new Set(playtestingUpdates.map(pu => pu.project))].map(n => ({ number: n })));

        if (updatingProjects.length === 0) {
            await cleanupDataBranch(context, existingPR, branchRef, DATA_BRANCH);
            return;
        }

        // Determine which packs differ from development
        const changedPacks: Array<{ project: IProject; content: string }> = [];
        for (const project of updatingProjects) {
            const cards = await syncImage(await dataService.cards.read({ project: project.number, latest: true, release: null }));
            const pack = { cgdbId: null, code: project.code, name: `${project.name} (Unreleased)`, releaseDate: null, workInProgress: true, cards: cards.map(toExportCard) };
            const content = JSON.stringify(pack, null, 4).replace(/\r/g, "");
            const devContent = await getDataFileContent(context, `packs/${project.code}.json`, BASE_BRANCH);
            if (devContent?.trim() !== content.trim()) {
                changedPacks.push({ project, content });
            }
        }

        if (changedPacks.length === 0) {
            await cleanupDataBranch(context, existingPR, branchRef, DATA_BRANCH);
            return;
        }

        // Ensure branch exists (created from development HEAD if new)
        if (!branchRef) {
            const { data: baseRef } = await context.client.rest.git.getRef({ owner: context.owner, repo: context.repo, ref: `heads/${BASE_BRANCH}` });
            await context.client.rest.git.createRef({ owner: context.owner, repo: context.repo, ref: `refs/heads/${DATA_BRANCH}`, sha: baseRef.object.sha });
        }

        // Commit each changed file (one commit per file, skip if already current on data branch)
        for (const { project, content } of changedPacks) {
            const filePath = `packs/${project.code}.json`;
            const dataFile = await getDataFileWithSha(context, filePath, DATA_BRANCH);
            if (dataFile?.content.trim() === content.trim()) {
                logger.info(`[Github] Skipping ${filePath} — already current on ${DATA_BRANCH}`);
                continue;
            }

            logger.info(`[Github] Committing ${filePath} to ${DATA_BRANCH} (dataFile ${dataFile ? "exists" : "is new"})`);
            await context.client.rest.repos.createOrUpdateFileContents({
                owner: context.owner,
                repo: context.repo,
                path: filePath,
                message: `Automatic sync of ${project.code} development pack changes`,
                content: Buffer.from(content).toString("base64"),
                branch: DATA_BRANCH,
                sha: dataFile?.sha
            });
            logger.info(`[Github] Committed ${filePath} to ${DATA_BRANCH}`);
        }

        await internalDataSync(existingPR, playtestingUpdates, context);
    } finally {
        release();
    }
}

async function getDataOpenPR(context: GithubContext, head: string, base: string) {
    const { data: [pr] } = await context.client.rest.pulls.list({ owner: context.owner, repo: context.repo, head: `${context.owner}:${head}`, base, state: "open" });
    return pr ?? null;
}

async function cleanupDataBranch(context: GithubContext, existingPR: PullRequest | undefined, branchRef: unknown, branchName: string) {
    if (existingPR) {
        await context.client.rest.pulls.update({ owner: context.owner, repo: context.repo, pull_number: existingPR.number, state: "closed" });
        logger.info(`[Github] Closed data pull request #${existingPR.number}`);
    }
    if (branchRef) {
        await context.client.rest.git.deleteRef({ owner: context.owner, repo: context.repo, ref: `heads/${branchName}` });
        logger.info(`[Github] Deleted branch ${branchName}`);
    }
}

async function getDataFileContent(context: GithubContext, path: string, branch: string): Promise<string | null> {
    try {
        const { data } = await context.client.rest.repos.getContent({ owner: context.owner, repo: context.repo, path, ref: branch });
        if (Array.isArray(data) || data.type !== "file") return null;
        return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8").replace(/\r/g, "");
    } catch {
        return null;
    }
}

async function getDataFileWithSha(context: GithubContext, path: string, branch: string): Promise<{ content: string; sha: string } | null> {
    try {
        const { data } = await context.client.rest.repos.getContent({ owner: context.owner, repo: context.repo, path, ref: branch });
        if (Array.isArray(data) || data.type !== "file") return null;
        return { content: Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8").replace(/\r/g, ""), sha: data.sha };
    } catch {
        return null;
    }
}

function isPROutdated(pullRequest: PullRequest | undefined, playtestingUpdates: IPlaytestingUpdate[], newlyImplemented: IPlaytestCard[]) {
    if (!pullRequest) {
        return true;
    }
    const prUpdatedAt = new Date(pullRequest.updated_at);
    const outdated = playtestingUpdates.some((pu) => !pu._metadata?.github?.lastSynced || pu.updated > pu._metadata.github.lastSynced) || newlyImplemented.some((ni) => ni.updated > prUpdatedAt);
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

async function internalDataSync(existingPR: PullRequest | undefined, playtestingUpdates: IPlaytestingUpdate[], context: GithubContext) {
    const details = await pullRequests.data(playtestingUpdates, context);
    if (!existingPR) {
        const { data } = await context.client.rest.pulls.create(details);
        logger.info(`[Github] Created data pull request #${data.number}`);
    } else {
        const { data } = await context.client.rest.pulls.update({ pull_number: existingPR.number, ...details });
        logger.info(`[Github] Updated data pull request #${data.number}`);
    }
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
    },
    async data(playtestingUpdates: IPlaytestingUpdate[], context: GithubContext) {
        const updateLinks = await buildDataUpdateLinks(playtestingUpdates);

        const title = "Pack Data Update";
        const body = "# Pack Data Update"
        + "\n\nSyncs development pack data for the following playtesting updates:"
        + `\n${updateLinks}`;

        const labels = ["automated"];
        const head = `${context.owner}:development-updating`;
        const base = "development";
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
        if (card._metadata?.github?.status === "closed" && card.implemented === false) {
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

function toExportCard(card: IPlaytestCard) {
    return {
        code: card.code,
        version: card.version,
        type: card.type,
        name: card.name,
        octgnId: null,
        quantity: card.quantity,
        unique: card.unique,
        faction: card.faction,
        loyal: card.loyal,
        cost: card.cost,
        icons: card.icons,
        strength: card.strength,
        plotStats: card.plotStats,
        traits: card.traits,
        text: card.text,
        flavor: card.flavor,
        deckLimit: card.deckLimit,
        illustrator: card.illustrator ?? "?",
        designer: card.designer,
        imageUrl: card._metadata?.imageUrl
    };
}

async function buildDataUpdateLinks(playtestingUpdates: IPlaytestingUpdate[]) {
    const projects = await dataService.projects.read([...new Set(playtestingUpdates.map(pu => pu.project))].map(n => ({ number: n })));
    const projectMap = projects.reduce<Record<number, IProject>>((m, p) => {
        m[p.number] = p;
        return m;
    }, {});
    return playtestingUpdates.map(pu => {
        const project = projectMap[pu.project];
        return `- [${project.name} - Update ${pu.version}](${process.env.CLIENT_HOST}/project/${pu.project}/update/${pu.version})`;
    }).join("\n");
}