import { dataService, githubService, logger } from "@/services";
import { GithubPRMeta, IPlaytestingUpdate, IProject } from "common/models/projects";
import { GithubContext } from ".";
import { IPlaytestCard, NoteType } from "common/models/cards";
import { syncImage } from "@/rendering/hosting";
import { DEVELOPMENT_BRANCH, emojis, PLAYTESTING_BRANCH, STAGING_BRANCH } from "./utils";
import { parseCardCode, toJSONExportCard } from "common/utils";
import { sortBy } from "lodash-es";
import { Endpoints } from "@octokit/types";
import { createSyncEmitter } from "@/services/sseService";
import { Mutex } from "async-mutex";
import { RequestError } from "octokit";
import { StatusCodes } from "http-status-codes";

type PullRequest = Endpoints["GET /repos/{owner}/{repo}/pulls"]["response"]["data"][number];
type BranchRef = Endpoints["GET /repos/{owner}/{repo}/git/ref/{ref}"]["response"]["data"];

const syncCodePullRequestMutex = new Mutex();
const syncDataPullRequestMutex = new Mutex();

export async function syncCodePullRequests(forced?: boolean) {
    const release = await syncCodePullRequestMutex.acquire();
    let playtestingUpdates: IPlaytestingUpdate[] = [];
    try {
        playtestingUpdates = await readSyncingUpdates();
        const newlyImplemented = await dataService.cards.read({
            _metadata: { github: { status: "closed" } },
            implemented: false
        });
        const context = githubService.getContext();

        const emitters = new Map(
            playtestingUpdates.map((pt) => [pt, createSyncEmitter("playtestingUpdate", "github.code", pt)])
        );
        emitters.forEach((e) => e.start());

        const branches = { head: `${context.owner}:${DEVELOPMENT_BRANCH}`, base: PLAYTESTING_BRANCH };

        try {
            const lastSynced = new Date();
            const canCreatePullRequest = await isPlaytestingBranchBehind(context);
            if (!canCreatePullRequest) {
                // Playtesting matches development, so any pull request for these updates has already been merged
                const mergedPR = await findMergedPullRequest(context, branches);
                for (const playtestingUpdate of playtestingUpdates) {
                    applyPullRequestState(
                        playtestingUpdate,
                        "code",
                        lastSynced,
                        toMergedState(mergedPR, playtestingUpdate)
                    );
                }

                // Closed cards are live once development reaches playtesting; syncing would deadlock on this mutex
                await markCardsImplemented(newlyImplemented, false);
            } else {
                emitters.forEach((e) => e.progress("Searching"));
                const existingPR = await findOpenPullRequest(context, branches);

                let state: PullRequestState | undefined;
                const needsPullRequest = playtestingUpdates.length > 0 || newlyImplemented.length > 0;
                if (needsPullRequest) {
                    if (forced || isPROutdated(existingPR, playtestingUpdates, newlyImplemented)) {
                        emitters.forEach((e) => e.progress("Syncing"));
                        state = await internalSync(existingPR, playtestingUpdates, newlyImplemented, context);
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

                for (const playtestingUpdate of playtestingUpdates) {
                    applyPullRequestState(playtestingUpdate, "code", lastSynced, state);
                }
            }

            emitters.forEach((e, pt) => e.complete(pt));

            if (playtestingUpdates.length > 0) {
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
        playtestingUpdates = await readSyncingUpdates();
        const context = githubService.getContext("data");

        const emitters = new Map(
            playtestingUpdates.map((pu) => [pu, createSyncEmitter("playtestingUpdate", "github.data", pu)])
        );
        emitters.forEach((e) => e.start());

        let branchRef = await context.client.rest.git
            .getRef({ owner: context.owner, repo: context.repo, ref: `heads/${STAGING_BRANCH}` })
            .then((result) => result.data)
            .catch(() => null as BranchRef);
        const branches = { head: `${context.owner}:${STAGING_BRANCH}`, base: DEVELOPMENT_BRANCH };
        const existingPR = await findOpenPullRequest(context, branches);

        const hasSyncedFile: IPlaytestingUpdate[] = [];
        const lastSynced = new Date();

        let mergedPR: PullRequest | null = null;
        const getMergedPullRequest = async () => {
            mergedPR ??= await findMergedPullRequest(context, branches);
            return mergedPR;
        };

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
                    applyPullRequestState(playtestingUpdate, "data", lastSynced);
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
                    // Data already exists in development, so any pull request for it has already been merged
                    const merged = toMergedState(await getMergedPullRequest(), playtestingUpdate);
                    applyPullRequestState(playtestingUpdate, "data", lastSynced, merged);
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
            const state = await internalDataSync(existingPR, playtestingUpdates, context);
            for (const playtestingUpdate of hasSyncedFile) {
                applyPullRequestState(playtestingUpdate, "data", lastSynced, state);
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

// Updates sync until their code changes merge, whilst each project's latest update always keeps syncing
async function readSyncingUpdates() {
    const projects = await dataService.projects.read();
    return await dataService.playtestingUpdates.read([
        { _metadata: { github: { code: { status: { $exists: false } } } } },
        { _metadata: { github: { code: { status: "open" } } } },
        ...projects.map((project) => ({ project: project.number, version: project.version }))
    ]);
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
    const data = await createOrUpdatePullRequest(existingPR, details, context);
    logger.info(`[Github] ${existingPR ? "Updated" : "Created"} data pull request #${data.number}`);
    return toPullRequestState(data);
}

async function internalSync(
    existingPR: PullRequest | undefined,
    playtestingUpdates: IPlaytestingUpdate[],
    newlyImplemented: IPlaytestCard[],
    context: GithubContext
) {
    const details = await pullRequests.playtesting(playtestingUpdates, newlyImplemented, context);
    const data = await createOrUpdatePullRequest(existingPR, details, context);
    logger.info(
        `[Github] ${existingPR ? "Updated" : "Created"} pull request #${data.number} for latest playtesting changes`
    );
    return toPullRequestState(data);
}

async function createOrUpdatePullRequest(
    existingPR: PullRequest | undefined,
    details: PullRequestDetails,
    context: GithubContext
) {
    const { labels, ...pullRequest } = details;
    const update = (pullNumber: number) =>
        context.client.rest.pulls.update({ pull_number: pullNumber, ...pullRequest });

    let data: Awaited<ReturnType<typeof update>>["data"];
    if (existingPR) {
        ({ data } = await update(existingPR.number));
    } else {
        try {
            ({ data } = await context.client.rest.pulls.create(pullRequest));
        } catch (err) {
            // Another instance may have created it first, in which case theirs is adopted rather than duplicated
            const duplicate =
                err instanceof RequestError && err.status === StatusCodes.UNPROCESSABLE_ENTITY
                    ? await findOpenPullRequest(context, details)
                    : undefined;
            if (!duplicate) {
                throw err;
            }
            logger.info(`[Github] Adopted pull request #${duplicate.number}, which already existed`);
            ({ data } = await update(duplicate.number));
        }
    }

    // Labels are not supported by the pulls api, so must be applied seperately via the issues api
    await context.client.rest.issues.addLabels({
        owner: context.owner,
        repo: context.repo,
        issue_number: data.number,
        labels
    });

    return data;
}

async function findOpenPullRequest(context: GithubContext, { head, base }: PullRequestBranches) {
    const pullRequests = await context.client.paginate(context.client.rest.pulls.list, {
        owner: context.owner,
        repo: context.repo,
        base,
        state: "open",
        per_page: 100
    });
    const [existingPR, ...duplicates] = pullRequests
        .filter((pullRequest) => hasHead(pullRequest, head))
        .sort((a, b) => a.number - b.number);

    // Concurrent instances can slip past githubs duplicate checking, leaving more than one pull request open
    for (const duplicate of duplicates) {
        logger.warn(`[Github] Closing duplicate pull request #${duplicate.number} of #${existingPR.number}`);
        await context.client.rest.pulls.update({
            owner: context.owner,
            repo: context.repo,
            pull_number: duplicate.number,
            state: "closed"
        });
    }

    return existingPR;
}

async function findMergedPullRequest(context: GithubContext, { head, base }: PullRequestBranches) {
    const { data } = await context.client.rest.pulls.list({
        owner: context.owner,
        repo: context.repo,
        base,
        state: "closed",
        sort: "updated",
        direction: "desc",
        per_page: 100
    });

    return data.find((pullRequest) => pullRequest.merged_at && hasHead(pullRequest, head)) ?? null;
}

// Githubs own head filter is case sensitive, so matching is done here to avoid silently finding nothing
function hasHead(pullRequest: PullRequest, head: string) {
    return pullRequest.head.label?.toLowerCase() === head.toLowerCase();
}

function toPullRequestState(pullRequest: { html_url: string; state: string; merged_at?: string | null }) {
    return {
        pullRequestUrl: pullRequest.html_url,
        status: pullRequest.state as GithubPRMeta["status"],
        mergedAt: pullRequest.merged_at ? new Date(pullRequest.merged_at) : undefined
    };
}

// Only adopts a merged pull request created after the update itself, as earlier ones cannot contain its changes
function toMergedState(pullRequest: PullRequest | null, playtestingUpdate: IPlaytestingUpdate) {
    if (!pullRequest?.merged_at || new Date(pullRequest.merged_at) < new Date(playtestingUpdate.created)) {
        return undefined;
    }
    return toPullRequestState(pullRequest);
}

export async function markCardsImplemented(cards: IPlaytestCard[], sync = true) {
    if (cards.length === 0) {
        return;
    }

    for (const card of cards) {
        card.implemented = true;
    }
    cards = await dataService.cards.update(cards, false, sync);

    logger.info(`[Github] Updated ${cards.length} cards as implemented`);
}

// Refreshes lastSynced; an undefined state leaves existing pull request details untouched, whilst null clears them
export function applyPullRequestState(
    playtestingUpdate: IPlaytestingUpdate,
    key: "code" | "data",
    lastSynced: Date,
    state?: PullRequestState | null
) {
    playtestingUpdate._metadata ??= {};
    playtestingUpdate._metadata.github ??= {};
    const meta = (playtestingUpdate._metadata.github[key] ??= {});

    meta.lastSynced = lastSynced;

    if (state === undefined) {
        return;
    }

    if (state === null) {
        delete meta.pullRequestUrl;
        delete meta.status;
        delete meta.mergedAt;
        return;
    }

    meta.pullRequestUrl = state.pullRequestUrl;
    meta.status = state.status;
    if (state.mergedAt) {
        meta.mergedAt = state.mergedAt;
    } else {
        delete meta.mergedAt;
    }
}

type PullRequestBranches = { head: string; base: string };
type PullRequestState = ReturnType<typeof toPullRequestState>;
type PullRequestDetails = Awaited<ReturnType<(typeof pullRequests)["data" | "playtesting"]>>;

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
