/* eslint-disable @typescript-eslint/no-explicit-any */
import { Migration } from "../lib/types";
import { log, createProgress } from "../lib/logger";

const BATCH_SIZE = 500;

// Old artwork vocabulary -> new, 1:1 by position; `type` is left unset, as nothing historical infers it
const artworkStatusMap: Record<string, string> = {
    pending: "pending",
    commissioned: "acquiring",
    received: "confirming",
    approved: "complete"
};

// Old production vocabulary -> new; the old lane had no middle stage, so nothing lands on "compositing"
const productionStatusMap: Record<string, string> = {
    pending: "waiting",
    filed: "complete"
};

// Old {development, wording} -> new sequential design.status. A collapse rather than a rename, since
// the old pair can combine in ways the sequential model can't produce; wording only counts once finalising
function collapseDesignStatus(development: string, wording: string): string {
    if (development !== "ready") {
        return "forging";
    }
    if (wording === "approved") {
        return "complete";
    }
    return "refinement";
}

export const migration: Migration = {
    name: "009_slotDesignLane",
    description:
        "Collapses ISlot.statuses.development/wording into a single sequential design lane, and remaps the artwork & production status vocabularies - operates on dest only, since this is current-model live data, not a legacy-source sync",

    async run({ destDb, dryRun }) {
        const slotsCol = destDb.collection("slots");

        const slots = await slotsCol.find({ "statuses.development": { $exists: true } }).toArray();
        log.info(`Found ${slots.length} slot(s) still on the old development/wording shape`);

        if (slots.length === 0) {
            log.info("Nothing to migrate");
            return;
        }

        if (dryRun) {
            log.info(`[dry-run] Would convert statuses on ${slots.length} slot(s)`);
            return;
        }

        const ops = slots.map((slot: any) => {
            const { development, wording, artwork, production } = slot.statuses;
            const designStatus = collapseDesignStatus(development, wording);
            const reachedFinalising = development === "ready";

            return {
                updateOne: {
                    filter: { _id: slot._id },
                    update: {
                        $set: {
                            statuses: {
                                design: {
                                    status: designStatus,
                                    checks: [],
                                    ...(reachedFinalising && {
                                        finalApproval: { by: slot.updatedBy, at: slot.updated }
                                    })
                                },
                                artwork: { status: artworkStatusMap[artwork] ?? "pending" },
                                production: productionStatusMap[production] ?? "waiting"
                            }
                        }
                    }
                }
            };
        });

        const progress = createProgress("slots");
        let done = 0;
        for (let i = 0; i < ops.length; i += BATCH_SIZE) {
            const batch = ops.slice(i, i + BATCH_SIZE);
            await slotsCol.bulkWrite(batch as any, { ordered: false });
            done += batch.length;
            progress.counter(done, ops.length);
        }
        progress.done(`${done} converted`);

        log.success(`Slot design-lane migration complete — ${done} slot(s) converted`);
    }
};
