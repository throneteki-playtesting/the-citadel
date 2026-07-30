/* eslint-disable @typescript-eslint/no-explicit-any */
import { Migration } from "../lib/types";
import { log, createProgress } from "../lib/logger";
import { normalizeDeckLink } from "../lib/deckLinks";

const BATCH_SIZE = 500;

export const migration: Migration = {
    name: "007_reviewDeckShape",
    description:
        "Converts IPlaytestReview.decks from a raw link-string array into { link, shared } objects, and fixes legacy /deck/edit/ links - operates on dest only, since dest-only reviews (submitted live) are never touched by 003_reviews",

    async run({ destDb, dryRun }) {
        const reviewsCol = destDb.collection("reviews");

        const reviews = await reviewsCol
            .find({
                $or: [{ decks: { $elemMatch: { $type: "string" } } }, { "decks.link": /\/deck\/edit\// }]
            })
            .toArray();
        log.info(`Found ${reviews.length} review(s) needing deck shape/link fixes`);

        if (reviews.length === 0) {
            log.info("Nothing to migrate");
            return;
        }

        if (dryRun) {
            log.info(`[dry-run] Would convert decks on ${reviews.length} review(s)`);
            return;
        }

        const ops = reviews.map((review) => ({
            updateOne: {
                filter: { _id: review._id },
                update: {
                    $set: {
                        decks: (review.decks ?? []).map((deck: any) =>
                            typeof deck === "string"
                                ? { link: normalizeDeckLink(deck), shared: true }
                                : { ...deck, link: normalizeDeckLink(deck.link) }
                        )
                    }
                }
            }
        }));

        const progress = createProgress("reviews");
        let done = 0;
        for (let i = 0; i < ops.length; i += BATCH_SIZE) {
            const batch = ops.slice(i, i + BATCH_SIZE);
            await reviewsCol.bulkWrite(batch as any, { ordered: false });
            done += batch.length;
            progress.counter(done, ops.length);
        }
        progress.done(`${done} converted`);

        log.success(`Review deck shape migration complete — ${done} review(s) converted`);
    }
};
