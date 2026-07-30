import { dataService, githubService, logger } from "@/services";
import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { GithubContext } from ".";
import { IPlaytestCard, NoteType } from "common/models/cards";
import { syncImage } from "@/rendering/hosting";
import { emojis } from "./utils";
import { parseCardCode, toJSONExportCard } from "common/utils";
import { merge, sortBy } from "lodash-es";
import { Endpoints } from "@octokit/types";
import { createSyncEmitter } from "@/services/sseService";
import { Mutex } from "async-mutex";

type PullRequest = Endpoints["GET /repos/{owner}/{repo}/pulls"]["response"]["data"][number];
type BranchRef = Endpoints["GET /repos/{owner}/{repo}/git/ref/{ref}"]["response"]["data"];

const syncCodePullRequestMutex = new Mutex();
const syncDataPullRequestMutex = new Mutex();

const DEVELOPMENT_BRANCH = "development";
const PLAYTESTING_BRANCH = "playtesting";
const STAGING_BRANCH = "development-updating";

export async function syncCodePullRequests(forced?: boolean) {
    const release = await syncCodePullRequestMutex.acquire();
    let playtestingUpdates: IPlaytestingUpdate[] = [];
    try {
        playtestingUpdates = await dataService.playtestingUpdates.read([
            { _metadata: { github: { code: { status: { $exists: false } } } } },
            { _metadata: { github: { code: { status: "open" } } } }
        ]);
        const newlyImplemented = await dataService.cards.read({
            _metadata: { github: { status: "closed" } },
            implemented: false
        });
        const context = githubService.getContext();

        const emitters = new Map(
            playtestingUpdates.map((pt) => [pt, createSyncEmitter("playtestingUpdate", "github.code", pt)])
        );
        emitters.forEach((e) => e.start());

        try {
            const canCreatePullRequest = await isPlaytestingBranchBehind(context);
            const toUpdate: IPlaytestingUpdate[] = [];
            if (!canCreatePullRequest) {
                for (const playtestingUpdate of playtestingUpdates) {
                    merge(playtestingUpdate, { _metadata: { github: {} } });
                    playtestingUpdate._metadata.github.code = { lastSynced: new Date() };
                    toUpdate.push(playtestingUpdate);
                }
            } else {
                emitters.forEach((e) => e.progress("Searching"));
                const {
                    data: [existingPR]
                } = await context.client.rest.pulls.list({
                    owner: context.owner,
                    repo: context.repo,
                    head: `${context.owner}:${DEVELOPMENT_BRANCH}`,
                    base: PLAYTESTING_BRANCH,
                    state: "open"
                });

                const needsPullRequest = playtestingUpdates.length > 0 || newlyImplemented.length > 0;
                if (needsPullRequest) {
                    if (forced || isPROutdated(existingPR, playtestingUpdates, newlyImplemented)) {
                        emitters.forEach((e) => e.progress("Syncing"));
                        const { syncedAt, url, status, mergedAt } = await internalSync(
                            existingPR,
                            playtestingUpdates,
                            newlyImplemented,
                            context
                        );
                        for (const playtestingUpdate of playtestingUpdates) {
                            merge(playtestingUpdate, {
                                _metadata: {
                                    github: { code: { pullRequestUrl: url, mergedAt, status, lastSynced: syncedAt } }
                                }
                            });
                        }
                    }
                } else if (existingPR) {
                    logger.info(
                        `[Github] Closing pull request #${existingPR.number} as no latest playtesting changes exist`
                    );
                    await context.client.rest.pulls.update({
                        owner: context.owner,
                        repo: context.repo,
                        pull_number: existingPR.number,
                        state: "closed"
                    });
                }
            }

            emitters.forEach((e, pt) => e.complete(pt));

            if (toUpdate.length > 0) {
                playtestingUpdates = await dataService.playtestingUpdates.update(
                    playtestingUpdates,
                    false,
                    false,
                    false
                );
            }
        } catch (err) {
            emitters.forEach((e) => e.error("Failure"));
            logger.warn(new Error("[Github] Failed to sync code pull request", { cause: err }));
        }
    } finally {
        release();
    }

    return playtestingUpdates;
}

export async function syncDataPullRequests(forced?: boolean) {
    const release = await syncDataPullRequestMutex.acquire();
    let playtestingUpdates: IPlaytestingUpdate[] = [];
    try {
        playtestingUpdates = await dataService.playtestingUpdates.read([
            { _metadata: { github: { code: { status: { $exists: false } } } } },
            { _metadata: { github: { code: { status: "open" } } } }
        ]);
        const context = githubService.getContext("data");

        const emitters = new Map(
            playtestingUpdates.map((pu) => [pu, createSyncEmitter("playtestingUpdate", "github.data", pu)])
        );
        emitters.forEach((e) => e.start());

        let branchRef = await context.client.rest.git
            .getRef({ owner: context.owner, repo: context.repo, ref: `heads/${STAGING_BRANCH}` })
            .then((result) => result.data)
            .catch(() => null as BranchRef);
        const {
            data: [existingPR]
        } = await context.client.rest.pulls.list({
            owner: context.owner,
            repo: context.repo,
            head: `${context.owner}:${STAGING_BRANCH}`,
            base: DEVELOPMENT_BRANCH,
            state: "open"
        });

        const hasSyncedFile: IPlaytestingUpdate[] = [];

        for (const playtestingUpdate of playtestingUpdates) {
            try {
                const [project] = await dataService.projects.read({ number: playtestingUpdate.project });

                if (!project) {
                    throw Error(
                        `Project ${playtestingUpdate.project} does not exist for Playtesting Update #${playtestingUpdate.version}`
                    );
                }

                emitters.get(playtestingUpdate).progress("Checking");

                // Checking greater than to account for Playtesting Update creation, where its created prior to project being updated
                const isLatest = playtestingUpdate.version >= project.version;

                // Prevents data from being reverted to an older version
                if (!isLatest) {
                    playtestingUpdate._metadata.github.data = { lastSynced: new Date() };
                    continue;
                }

                // Builds the new data file & compares it to current development file
                const cards = await syncImage(await dataService.cards.read({ project: project.number, latest: true }));
                const pack = {
                    cgdbId: null,
                    code: project.code,
                    name: `${project.name} (Unreleased)`,
                    releaseDate: null,
                    workInProgress: true,
                    cards: cards.map((card) => toJSONExportCard(card))
                };
                const content = JSON.stringify(pack, null, 4).replace(/\r/g, "");
                const devContent = await getDataFileContent(context, `packs/${project.code}.json`, DEVELOPMENT_BRANCH);

                if (!forced && devContent?.trim() === content.trim()) {
                    playtestingUpdate._metadata.github.data = { lastSynced: new Date() };
                    continue;
                }

                // Create branch if it doesnt already exist
                if (!branchRef) {
                    const { data: baseRef } = await context.client.rest.git.getRef({
                        owner: context.owner,
                        repo: context.repo,
                        ref: `heads/${DEVELOPMENT_BRANCH}`
                    });
                    const response = await context.client.rest.git.createRef({
                        owner: context.owner,
                        repo: context.repo,
                        ref: `refs/heads/${STAGING_BRANCH}`,
                        sha: baseRef.object.sha
                    });
                    branchRef = response.data;
                }

                // Commits changed card file to staging branch
                emitters.get(playtestingUpdate).progress("Committing");
                const filePath = `packs/${project.code}.json`;
                const dataFile = await getDataFileWithSha(context, filePath, STAGING_BRANCH);
                if (!dataFile || dataFile.content.trim() !== content.trim()) {
                    logger.info(
                        `[Github] Committing ${filePath} to ${STAGING_BRANCH} (dataFile ${dataFile ? "exists" : "is new"})`
                    );
                    await context.client.rest.repos.createOrUpdateFileContents({
                        owner: context.owner,
                        repo: context.repo,
                        path: filePath,
                        message: `Automatic sync of ${project.code} development pack changes`,
                        content: Buffer.from(content).toString("base64"),
                        branch: STAGING_BRANCH,
                        sha: dataFile?.sha
                    });
                    logger.info(`[Github] Committed ${filePath} to ${STAGING_BRANCH}`);
                }

                hasSyncedFile.push(playtestingUpdate);
            } catch (err) {
                emitters.get(playtestingUpdate).error("Failure");
                emitters.delete(playtestingUpdate);
                logger.warn(new Error("[Github] Failed to sync data pull request", { cause: err }));
            }
        }
        emitters.forEach((e) => e.progress("Syncing"));
        // Only creates Pull Request if one or more files have synced
        if (hasSyncedFile.length > 0) {
            const { url, status, syncedAt } = await internalDataSync(existingPR, playtestingUpdates, context);
            for (const playtestingUpdate of hasSyncedFile) {
                merge(playtestingUpdate, {
                    _metadata: { github: { data: { pullRequestUrl: url, status, lastSynced: syncedAt } } }
                });
            }
        }
        emitters.forEach((e, pu) => e.complete(pu));

        // But updates all playtesting updates as some may just have their lastSynced updated, and nothing else
        playtestingUpdates = await dataService.playtestingUpdates.update(playtestingUpdates, false, false, false);
    } finally {
        release();
    }

    return playtestingUpdates;
}

async function getDataFileContent(context: GithubContext, path: string, branch: string): Promise<string | null> {
    try {
        const { data } = await context.client.rest.repos.getContent({
            owner: context.owner,
            repo: context.repo,
            path,
            ref: branch
        });
        if (Array.isArray(data) || data.type !== "file") return null;
        return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8").replace(/\r/g, "");
    } catch {
        return null;
    }
}

async function getDataFileWithSha(
    context: GithubContext,
    path: string,
    branch: string
): Promise<{ content: string; sha: string } | null> {
    try {
        const { data } = await context.client.rest.repos.getContent({
            owner: context.owner,
            repo: context.repo,
            path,
            ref: branch
        });
        if (Array.isArray(data) || data.type !== "file") return null;
        return {
            content: Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8").replace(/\r/g, ""),
            sha: data.sha
        };
    } catch {
        return null;
    }
}

function isPROutdated(
    pullRequest: PullRequest | undefined,
    playtestingUpdates: IPlaytestingUpdate[],
    newlyImplemented: IPlaytestCard[]
) {
    if (!pullRequest) {
        return true;
    }
    const prUpdatedAt = new Date(pullRequest.updated_at);
    const outdated =
        playtestingUpdates.some(
            (pu) => !pu._metadata?.github?.code?.lastSynced || pu.updated > pu._metadata.github.code.lastSynced
        ) || newlyImplemented.some((ni) => ni.updated > prUpdatedAt);
    if (outdated) {
        return true;
    }

    // Final "expensive" check to scan the list of implemented codes and compare to newly implemented
    const existingCodes = extractImplementedCodes(pullRequest);
    const newCodes = newlyImplemented.map((card) => parseCardCode(false, card.project, card.number) as string);
    return existingCodes.length !== newCodes.length || existingCodes.some((code) => !newCodes.includes(code));
}

async function isPlaytestingBranchBehind(context: GithubContext) {
    const { data } = await context.client.rest.repos.compareCommitsWithBasehead({
        owner: context.owner,
        repo: context.repo,
        basehead: `${PLAYTESTING_BRANCH}...${DEVELOPMENT_BRANCH}`
    });

    return data.total_commits > 0;
}

async function internalDataSync(
    existingPR: PullRequest | undefined,
    playtestingUpdates: IPlaytestingUpdate[],
    context: GithubContext
) {
    const details = await pullRequests.data(playtestingUpdates, context);
    if (!existingPR) {
        const { data } = await context.client.rest.pulls.create(details);
        logger.info(`[Github] Created data pull request #${data.number}`);
        return { url: data.html_url, status: data.state as "open" | "closed", syncedAt: new Date() };
    } else {
        const { data } = await context.client.rest.pulls.update({ pull_number: existingPR.number, ...details });
        logger.info(`[Github] Updated data pull request #${data.number}`);
        return { url: data.html_url, status: data.state as "open" | "closed", syncedAt: new Date() };
    }
}

async function internalSync(
    existingPR: PullRequest | undefined,
    playtestingUpdates: IPlaytestingUpdate[],
    newlyImplemented: IPlaytestCard[],
    context: GithubContext
) {
    const details = await pullRequests.playtesting(playtestingUpdates, newlyImplemented, context);
    if (!existingPR) {
        const { data } = await context.client.rest.pulls.create(details);
        logger.info(`[Github] Created pull request #${data.number} for latest playtesting changes`);
        return {
            syncedAt: new Date(),
            url: data.html_url,
            status: data.state as "open" | "closed",
            mergedAt: data.merged_at ? new Date(data.merged_at) : undefined
        };
    } else {
        const { data } = await context.client.rest.pulls.update({ pull_number: existingPR.number, ...details });
        logger.info(`[Github] Updated pull request #${data.number} for latest playtesting changes`);
        return {
            syncedAt: new Date(),
            url: data.html_url,
            status: data.state as "open" | "closed",
            mergedAt: data.merged_at ? new Date(data.merged_at) : undefined
        };
    }
}

function extractImplementedCodes(pullRequest: PullRequest) {
    const implementedSection = pullRequest.body?.split(/## .* Implemented Cards/)[1] ?? "";
    const CODE_COLUMN_PATTERN = /^\|[^|]+\|\s*([^|]+?)\s*\|/gm;
    const codes = [...implementedSection.matchAll(CODE_COLUMN_PATTERN)]
        .filter((match) => !match[0].startsWith("|--") && !match[0].includes("Code"))
        .map((match) => match[1].trim());

    return codes;
}

const pullRequests = {
    async playtesting(
        playtestingUpdates: IPlaytestingUpdate[],
        newlyImplemented: IPlaytestCard[],
        context: GithubContext
    ) {
        const date = new Date();
        const version = `${date.getFullYear().toString().slice(-2)}.${date.getMonth() + 1}.${date.getDate()}`;

        const projectChanges = await buildProjectChanges(playtestingUpdates);
        const implementedCards = await buildImplementedCards(newlyImplemented);

        const title = `Website Update ${version}`;
        const body =
            `# ${emojis.announcement} Playtesting Website Update ${version}` +
            "\nApplies the latest updates to [playtesting.theironthrone.net](https://playtesting.theironthrone.net), which may contain new playtesting content, updated playtesting content and/or bug fixes. Not all changes are documented in this PR, and adjustments should be considered unstable." +
            "\n\n> [!WARNING]" +
            "\n> Code implemented for playtesting should always be treated as unstable. Expect bugs, and kindly report them to the [discord bugs forum](https://discord.com/channels/698308957822779462/1343356199244005466) with as much detail as possible." +
            "\n\n" +
            projectChanges +
            implementedCards;

        const labels = ["automated", "playtest-update"];
        const head = `${context.owner}:${DEVELOPMENT_BRANCH}`;
        const base = PLAYTESTING_BRANCH;
        return { title, body, labels, owner: context.owner, repo: context.repo, head, base };
    },
    async data(playtestingUpdates: IPlaytestingUpdate[], context: GithubContext) {
        const updateLinks = await buildDataUpdateLinks(playtestingUpdates);

        const title = "Pack Data Update";
        const body =
            "# Pack Data Update" +
            "\n\nSyncs development pack data for the following playtesting updates:" +
            `\n${updateLinks}`;

        const labels = ["automated"];
        const head = `${context.owner}:${STAGING_BRANCH}`;
        const base = DEVELOPMENT_BRANCH;
        return { title, body, labels, owner: context.owner, repo: context.repo, head, base };
    }
};

async function buildImplementedCards(cards: IPlaytestCard[]) {
    if (cards.length === 0) {
        return "";
    }
    cards = sortBy(cards, ["project", "number"]);

    const projects = await dataService.projects.read(
        [...new Set(cards.map((card) => card.project))].map((project) => ({ number: project }))
    );
    const projectMap = projects.reduce<Record<number, IProject>>((map, project) => {
        map[project.number] = map[project.number] ?? project;
        return map;
    }, {});

    const rows: string[] = [];
    for (const card of cards) {
        const project = projectMap[card.project];
        const row = `\n| :${project.emoji}: ${project.code} | ${parseCardCode(false, card.project, card.number)} | ${card.name} | ${card.version} |`;
        rows.push(row);
    }

    return (
        `## ${emojis.implemented} Implemented Cards` +
        "\nThe following cards were implemented; they may or may not be part of a project update." +
        "\n\n| Project | Code | Name | Version |" +
        "\n|--------|--------|--------|--------|" +
        rows
    );
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
    return "## Project Changes" + `\n${projectChanges.join("\n\n##\n\n")}` + "\n\n##\n\n";
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
        .filter((type) => typeCounts[type] > 0)
        .map((type) => {
            const count = typeCounts[type];
            const label = count === 1 ? "card" : "cards";
            return `${emojis[type]} ${count} ${label} ${type}`;
        });

    const implementedLine = `${emojis.implemented} ${implementedCount}/${cards.length} cards in this update were implemented.`;

    return [...typeLines, "", implementedLine].join("\n");
}

async function buildDataUpdateLinks(playtestingUpdates: IPlaytestingUpdate[]) {
    const projects = await dataService.projects.read(
        [...new Set(playtestingUpdates.map((pu) => pu.project))].map((n) => ({ number: n }))
    );
    const projectMap = projects.reduce<Record<number, IProject>>((m, p) => {
        m[p.number] = p;
        return m;
    }, {});
    return playtestingUpdates
        .map((pu) => {
            const project = projectMap[pu.project];
            return `- [${project.name} - Update ${pu.version}](${process.env.CLIENT_HOST}/project/${pu.project}/update/${pu.version})`;
        })
        .join("\n");
}
