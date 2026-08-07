/* eslint-disable @typescript-eslint/no-explicit-any */
import { Collection, ObjectId } from "mongodb";
import { Migration } from "../lib/types";
import { log, createProgress } from "../lib/logger";
import { fetchAllPullRequests, parsePRTitle, parsePRBody, ParsedCardChange } from "../lib/github";
import { ChannelMessage, fetchChannelMessages } from "../lib/discord";

const userId = "120834530801221634";
const BATCH_SIZE = 500;
const ANNOUNCEMENTS_CHANNEL_NAME = "playtest-announcements";

type SemanticVersion = string;

type GithubPRDoc = {
    status?: "open" | "closed";
    mergedAt?: Date;
    pullRequestUrl?: string;
    lastSynced?: Date;
};

type PlaytestingUpdateDoc = {
    project: number;
    version: number;
    cardChanges: Record<number, SemanticVersion>;
    "_metadata.github": {
        code?: GithubPRDoc;
        data?: GithubPRDoc;
    };
    created: Date;
    createdBy: string;
    updated: Date;
    updatedBy: string;
};

type DiscordDoc = {
    messageUrl?: string;
    lastSynced?: Date;
};

async function resolveProject(projectsCol: Collection, code: string) {
    return await projectsCol.findOne({ code });
}

async function findCard(cardsCol: Collection, projectNumber: number, change: ParsedCardChange) {
    return await cardsCol.findOne({
        project: projectNumber,
        number: change.cardNumber,
        version: change.version
    });
}

async function applyCardNote(
    cardsCol: Collection,
    card: Awaited<ReturnType<typeof findCard>>,
    change: ParsedCardChange,
    dryRun: boolean
): Promise<"applied" | "skipped" | "notfound"> {
    if (!card) return "notfound";
    if (card.note) return "skipped";

    if (dryRun) return "applied";

    await cardsCol.updateOne({ _id: card._id }, { $set: { note: { type: change.noteType, text: change.noteText } } });
    return "applied";
}

// Announcements are matched on their opening line, which names the project and the update number
function findAnnouncement(messages: ChannelMessage[], projectName: string, version: number) {
    const versionPattern = new RegExp(`playtesting update #?${version}\\b`, "i");
    const name = projectName.toLowerCase();
    return messages.find(
        (message) => message.firstLine.toLowerCase().includes(name) && versionPattern.test(message.firstLine)
    );
}

// A fully implemented update can never change again, so it is marked synced & left alone from here on
function buildDiscordDoc(messageUrl: string | undefined, allImplemented: boolean, now: Date): DiscordDoc | null {
    if (!messageUrl && !allImplemented) {
        return null;
    }
    return { ...(messageUrl && { messageUrl }), ...(allImplemented && { lastSynced: now }) };
}

export const migration: Migration = {
    name: "004_playtestingUpdates",
    description: "Build playtestingUpdates from GitHub PRs and backfill missing card notes",

    async run({ destDb, dryRun }) {
        const playtestingUpdatesCol = destDb.collection("playtestingUpdates");
        const projectsCol = destDb.collection("projects");
        const cardsCol = destDb.collection("cards");

        log.info("Fetching pull requests from GitHub...");
        const allPRs = await fetchAllPullRequests();

        const matchedPRs = allPRs
            .map((pr) => ({ pr, parsed: parsePRTitle(pr.title) }))
            .filter(
                (x): x is { pr: (typeof allPRs)[0]; parsed: NonNullable<ReturnType<typeof parsePRTitle>> } =>
                    x.parsed !== null
            );

        log.info(`${matchedPRs.length} / ${allPRs.length} PRs match the playtesting update format`);

        if (matchedPRs.length === 0) {
            log.warn("No matching PRs found — skipping");
            return;
        }

        log.info("Fetching existing announcements from Discord...");
        const announcements = await fetchChannelMessages(ANNOUNCEMENTS_CHANNEL_NAME);

        const now = new Date();
        const ops: object[] = [];
        const discordOps: object[] = [];
        let notesApplied = 0,
            notesSkipped = 0,
            cardsNotFound = 0,
            announcementsLinked = 0;

        const prProgress = createProgress("Processing PRs");
        for (let i = 0; i < matchedPRs.length; i++) {
            const { pr, parsed } = matchedPRs[i];
            const { projectCode, updateNumber } = parsed;
            prProgress.counter(i + 1, matchedPRs.length, `PR #${pr.number}`);

            const project = await resolveProject(projectsCol, projectCode);
            if (!project) {
                log.warn(`  Could not find project "${projectCode}" in dest DB — skipping PR #${pr.number}`);
                continue;
            }
            const projectNumber = project.number as number;

            const cardChanges: Record<number, SemanticVersion> = {};
            const parsedChanges: ParsedCardChange[] = pr.body ? parsePRBody(pr.body, pr.number) : [];
            let implemented = 0;

            for (const change of parsedChanges) {
                cardChanges[change.cardNumber] = change.version;

                const card = await findCard(cardsCol, projectNumber, change);
                if (card?.implemented) {
                    implemented++;
                }

                const result = await applyCardNote(cardsCol, card, change, dryRun);
                if (result === "applied") {
                    notesApplied++;
                } else if (result === "skipped") {
                    notesSkipped++;
                } else {
                    cardsNotFound++;
                    log.verbose(
                        `  Card not found: project=${projectNumber} number=${change.cardNumber} version=${change.version}`
                    );
                }
            }

            const announcement = findAnnouncement(announcements, project.name as string, updateNumber);
            if (announcement) {
                announcementsLinked++;
            } else {
                log.verbose(`  No announcement matched for ${project.name} playtesting update ${updateNumber}`);
            }
            const discord = buildDiscordDoc(announcement?.url, implemented === parsedChanges.length, now);

            const setDoc: PlaytestingUpdateDoc = {
                project: projectNumber,
                version: updateNumber,
                cardChanges,
                "_metadata.github": {
                    code: {
                        status: pr.merged ? "closed" : pr.state,
                        ...(pr.mergedAt && { mergedAt: pr.mergedAt }),
                        pullRequestUrl: pr.pullRequestUrl,
                        lastSynced: now
                    },
                    data: { lastSynced: now }
                },
                created: pr.createdAt,
                createdBy: userId,
                updated: pr.updatedAt,
                updatedBy: userId
            };

            ops.push({
                updateOne: {
                    filter: { project: projectNumber, version: updateNumber },
                    update: { $set: setDoc, $setOnInsert: { _id: new ObjectId() } },
                    upsert: true
                }
            });

            // Runs once the upserts above have landed, and only where nothing has been announced yet
            if (discord) {
                discordOps.push({
                    updateOne: {
                        filter: {
                            project: projectNumber,
                            version: updateNumber,
                            "_metadata.discord.messageUrl": { $exists: false }
                        },
                        update: { $set: { "_metadata.discord": discord } }
                    }
                });
            }
        }
        prProgress.done(
            `done — ${ops.length} updates built, ${notesApplied} notes applied, ${notesSkipped} already present${cardsNotFound > 0 ? `, ${cardsNotFound} cards not found` : ""}, ${announcementsLinked} announcements linked`
        );

        if (dryRun) {
            log.info(`[dry-run] Would upsert ${ops.length} playtestingUpdate record(s)`);
            const unmatched = await playtestingUpdatesCol.countDocuments({
                $or: [
                    { "_metadata.github.code.lastSynced": { $exists: false } },
                    { "_metadata.github.data.lastSynced": { $exists: false } }
                ]
            });
            if (unmatched > 0) {
                log.info(
                    `[dry-run] Would set base-case code/data lastSynced on ${unmatched} unmatched playtestingUpdate(s)`
                );
            }
            log.info(`[dry-run] Would link ${discordOps.length} announcement(s) to their playtestingUpdate`);
            const unannounced = await playtestingUpdatesCol.countDocuments({
                "_metadata.discord": { $exists: false }
            });
            if (unannounced > 0) {
                log.info(`[dry-run] Would mark ${unannounced} playtestingUpdate(s) as already announced`);
            }
            return;
        }

        if (ops.length === 0) {
            log.warn("No playtestingUpdate documents to upsert");
            return;
        }

        const saveProgress = createProgress("Saving");
        let upserted = 0,
            modified = 0;
        for (let i = 0; i < ops.length; i += BATCH_SIZE) {
            const batch = ops.slice(i, i + BATCH_SIZE);
            const result = await playtestingUpdatesCol.bulkWrite(batch as any, { ordered: false });
            upserted += result.upsertedCount;
            modified += result.modifiedCount;
            saveProgress.counter(upserted + modified, ops.length);
        }
        saveProgress.done(`done — ${upserted} inserted, ${modified} updated`);

        let linked = 0;
        for (let i = 0; i < discordOps.length; i += BATCH_SIZE) {
            const batch = discordOps.slice(i, i + BATCH_SIZE);
            const result = await playtestingUpdatesCol.bulkWrite(batch as any, { ordered: false });
            linked += result.modifiedCount;
        }
        if (discordOps.length > 0) {
            log.info(`Linked ${linked} / ${discordOps.length} announcement(s) (already-announced updates are skipped)`);
        }

        const baseCase = await playtestingUpdatesCol.updateMany(
            {
                $or: [
                    { "_metadata.github.code.lastSynced": { $exists: false } },
                    { "_metadata.github.data.lastSynced": { $exists: false } }
                ]
            },
            { $set: { "_metadata.github.code.lastSynced": now, "_metadata.github.data.lastSynced": now } }
        );
        if (baseCase.modifiedCount > 0) {
            log.info(`Set base-case code/data lastSynced on ${baseCase.modifiedCount} unmatched playtestingUpdate(s)`);
        }

        // Anything without a linked announcement is treated as already announced, so it is never posted retroactively
        const announced = await playtestingUpdatesCol.updateMany(
            { "_metadata.discord": { $exists: false } },
            { $set: { "_metadata.discord.lastSynced": now } }
        );
        if (announced.modifiedCount > 0) {
            log.info(`Marked ${announced.modifiedCount} playtestingUpdate(s) as already announced`);
        }

        await playtestingUpdatesCol.dropIndex("project_1_version_1").catch(() => undefined);
        await playtestingUpdatesCol.createIndex({ project: 1, version: 1 }, { unique: true });
        log.success("playtestingUpdates migration complete");
    }
};
