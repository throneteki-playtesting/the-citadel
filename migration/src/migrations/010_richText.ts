/* eslint-disable @typescript-eslint/no-explicit-any */
import { Collection } from "mongodb";
import { Migration } from "../lib/types";
import { log, createProgress } from "../lib/logger";
import { fromLegacy, LegacyKind } from "../../../common/richText/fromLegacy";
import { toThronetekiText } from "../../../common/richText/toThroneteki";

const BATCH_SIZE = 500;

/** How many offending cards to name before the rest are only counted */
const REPORT_LIMIT = 20;

// Every field now holding the rich text format, and which legacy shape it was written in. Stated rather
// than sniffed: untagged card text would read as prose, and its literal "- " lines become a list
const FIELDS: { collection: string; path: string; kind: LegacyKind }[] = [
    { collection: "cards", path: "text", kind: "cardText" },
    { collection: "cards", path: "note.text", kind: "prose" },
    { collection: "suggestions", path: "card.text", kind: "cardText" },
    { collection: "projects", path: "description", kind: "prose" },
    { collection: "playtestingUpdates", path: "description", kind: "prose" },
    { collection: "reviews", path: "additional", kind: "prose" }
];

type PlannedField = {
    collection: Collection;
    path: string;
    updates: { _id: unknown; value: string }[];
};

function readPath(doc: any, path: string): unknown {
    return path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), doc);
}

export const migration: Migration = {
    name: "010_richText",
    description:
        "Converts every stored prose and card text field to the rich text format - <i> becomes <b><em>, and the old client-side prose conventions (***bold-italic***, **bold**, '- ' bullets, bare newlines) become real markup. Operates on dest only, and verifies card text still round trips to the pack dialect before writing anything",

    async run({ destDb, dryRun }) {
        // Converted and verified in full before a single write, so an abort leaves the data untouched
        const planned: PlannedField[] = [];
        const damaged: string[] = [];
        let damagedCount = 0;
        let normalisedCount = 0;

        for (const { collection, path, kind } of FIELDS) {
            const col = destDb.collection(collection);
            const docs = await col.find({ [path]: { $nin: [null, ""] } } as never).toArray();
            const isCardText = kind === "cardText";

            const updates: { _id: unknown; value: string }[] = [];
            for (const doc of docs) {
                const current = readPath(doc, path);
                if (typeof current !== "string" || !current.trim()) {
                    continue;
                }

                const converted = fromLegacy(current, kind);

                if (isCardText) {
                    // Pack json is byte-compared against development, so text exporting differently would
                    // rewrite every file. Both sides export, as that is the comparison which happens
                    const exported = toThronetekiText(converted);
                    if (exported !== toThronetekiText(current)) {
                        damagedCount += 1;
                        if (damaged.length < REPORT_LIMIT) {
                            damaged.push(`${collection} ${doc.code ?? doc.id ?? doc._id} (${doc.version ?? "-"})`);
                        }
                        continue;
                    }
                    // Exporting through a converter is new, so whatever it tidies shifts that entry once
                    if (converted !== current && exported !== current) {
                        normalisedCount += 1;
                    }
                }

                if (converted === current) {
                    continue;
                }
                updates.push({ _id: doc._id, value: converted });
            }

            log.info(`${collection}.${path}: ${updates.length} of ${docs.length} document(s) need converting`);
            planned.push({ collection: col, path, updates });
        }

        if (damagedCount > 0) {
            log.error(`${damagedCount} card(s) export differently once converted:`);
            damaged.forEach((entry) => log.info(`  ${entry}`));
            if (damagedCount > damaged.length) {
                log.info(`  ...and ${damagedCount - damaged.length} more`);
            }
            throw new Error("Card text round trip failed - resolve these cards before migrating");
        }

        if (normalisedCount > 0) {
            log.warn(
                `${normalisedCount} card(s) will export slightly tidier than they are stored (whitespace only) - expect that many pack entries to change on the next data PR, migration or not`
            );
        }

        const total = planned.reduce((sum, { updates }) => sum + updates.length, 0);
        if (total === 0) {
            log.info("Nothing to migrate");
            return;
        }
        if (dryRun) {
            log.info(`[dry-run] Would convert ${total} field(s) across ${planned.length} path(s)`);
            return;
        }

        for (const { collection, path, updates } of planned) {
            if (updates.length === 0) {
                continue;
            }
            const ops = updates.map(({ _id, value }) => ({
                updateOne: { filter: { _id }, update: { $set: { [path]: value } } }
            }));

            const progress = createProgress(`${collection.collectionName}.${path}`);
            let done = 0;
            for (let i = 0; i < ops.length; i += BATCH_SIZE) {
                const batch = ops.slice(i, i + BATCH_SIZE);
                await collection.bulkWrite(batch as any, { ordered: false });
                done += batch.length;
                progress.counter(done, ops.length);
            }
            progress.done(`${done} converted`);
        }

        log.success(`Rich text migration complete - ${total} field(s) converted`);
    }
};
