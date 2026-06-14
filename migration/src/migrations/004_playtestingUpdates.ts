/* eslint-disable @typescript-eslint/no-explicit-any */
import { Collection, ObjectId } from "mongodb";
import { Migration } from "../lib/types";
import { log, createProgress } from "../lib/logger";
import { fetchAllPullRequests, parsePRTitle, parsePRBody, ParsedCardChange } from "../lib/github";

const userId = "120834530801221634";
const BATCH_SIZE = 500;

type SemanticVersion = string;

type PlaytestingUpdateDoc = {
    project: number;
    version: number;
    cardChanges: Record<number, SemanticVersion>;
    _metadata: {
        github: {
            status: "open" | "closed";
            mergedAt?: Date;
            pullRequestUrl: string;
            lastSynced: Date;
        };
    };
    created: Date;
    createdBy: string;
    updated: Date;
    updatedBy: string;
};

async function resolveProjectNumber(projectsCol: Collection, code: string): Promise<number | null> {
    const project = await projectsCol.findOne({ code });
    return project ? (project.number as number) : null;
}

async function applyCardNote(
    cardsCol: Collection,
    projectNumber: number,
    change: ParsedCardChange,
    now: Date,
    dryRun: boolean
): Promise<"applied" | "skipped" | "notfound"> {
    const card = await cardsCol.findOne({
        project: projectNumber,
        number: change.cardNumber,
        version: change.version
    });

    if (!card) return "notfound";
    if (card.note) return "skipped";

    if (dryRun) return "applied";

    await cardsCol.updateOne(
        { _id: card._id },
        { $set: { note: { type: change.noteType, text: change.noteText } } }
    );
    return "applied";
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
            .map(pr => ({ pr, parsed: parsePRTitle(pr.title) }))
            .filter((x): x is { pr: typeof allPRs[0]; parsed: NonNullable<ReturnType<typeof parsePRTitle>> } =>
                x.parsed !== null
            );

        log.info(`${matchedPRs.length} / ${allPRs.length} PRs match the playtesting update format`);

        if (matchedPRs.length === 0) {
            log.warn("No matching PRs found — skipping");
            return;
        }

        const now = new Date();
        const ops: object[] = [];
        let notesApplied = 0, notesSkipped = 0, cardsNotFound = 0;

        const prProgress = createProgress("Processing PRs");
        for (let i = 0; i < matchedPRs.length; i++) {
            const { pr, parsed } = matchedPRs[i];
            const { projectCode, updateNumber } = parsed;
            prProgress.counter(i + 1, matchedPRs.length, `PR #${pr.number}`);

            const projectNumber = await resolveProjectNumber(projectsCol, projectCode);
            if (projectNumber === null) {
                log.warn(`  Could not find project "${projectCode}" in dest DB — skipping PR #${pr.number}`);
                continue;
            }

            const cardChanges: Record<number, SemanticVersion> = {};
            const parsedChanges: ParsedCardChange[] = pr.body ? parsePRBody(pr.body, pr.number) : [];

            for (const change of parsedChanges) {
                cardChanges[change.cardNumber] = change.version;

                const result = await applyCardNote(cardsCol, projectNumber, change, now, dryRun);
                if (result === "applied") {notesApplied++;}
                else if (result === "skipped") {notesSkipped++;}
                else {
                    cardsNotFound++;
                    log.verbose(`  Card not found: project=${projectNumber} number=${change.cardNumber} version=${change.version}`);
                }
            }

            const setDoc: PlaytestingUpdateDoc = {
                project: projectNumber,
                version: updateNumber,
                cardChanges,
                _metadata: {
                    github: {
                        status: pr.merged ? "closed" : pr.state,
                        ...(pr.mergedAt && { mergedAt: pr.mergedAt }),
                        pullRequestUrl: pr.pullRequestUrl,
                        lastSynced: now
                    }
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
        }
        prProgress.done(`done — ${ops.length} updates built, ${notesApplied} notes applied, ${notesSkipped} already present${cardsNotFound > 0 ? `, ${cardsNotFound} cards not found` : ""}`);

        if (dryRun) {
            log.info(`[dry-run] Would upsert ${ops.length} playtestingUpdate record(s)`);
            return;
        }

        if (ops.length === 0) {
            log.warn("No playtestingUpdate documents to upsert");
            return;
        }

        const saveProgress = createProgress("Saving");
        let upserted = 0, modified = 0;
        for (let i = 0; i < ops.length; i += BATCH_SIZE) {
            const batch = ops.slice(i, i + BATCH_SIZE);
            const result = await playtestingUpdatesCol.bulkWrite(batch as any, { ordered: false });
            upserted += result.upsertedCount;
            modified += result.modifiedCount;
            saveProgress.counter(upserted + modified, ops.length);
        }
        saveProgress.done(`done — ${upserted} inserted, ${modified} updated`);

        await playtestingUpdatesCol.dropIndex("project_1_version_1").catch(() => undefined);
        await playtestingUpdatesCol.createIndex({ project: 1, version: 1 }, { unique: true });
        log.success("playtestingUpdates migration complete");
    }
};