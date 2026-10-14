import { AnyBulkWriteOperation, Document } from "mongodb";
import { Migration } from "../lib/types";
import { log } from "../lib/logger";
import { projectTemplates } from "../../../common/models/projects";
import { factions } from "../../../common/models/cards";

const STANDARD = "standard";
const OPTION_KEYS = ["conditions", "important", "notes"] as const;

// Lays Standard's options over each initialised cycle's slots, by faction and number - any extras ask nothing
export const migration: Migration = {
    name: "015_standardTemplate",
    description: "Apply the Standard (120 slot) template to every initialised cycle project and its slots",

    async run({ destDb, dryRun }) {
        const template = projectTemplates.cycle[STANDARD]?.slots;
        if (!template) {
            throw new Error(`The cycle template "${STANDARD}" lays out no slots`);
        }
        const projectsCol = destDb.collection("projects");
        const slotsCol = destDb.collection("slots");

        const projects = await projectsCol.find({ type: "cycle", draft: { $ne: true } }).toArray();
        log.info(`Found ${projects.length} initialised cycle project(s)`);
        if (projects.length === 0) {
            return;
        }

        const slotOperations: AnyBulkWriteOperation<Document>[] = [];
        for (const project of [...projects].sort((a, b) => a.number - b.number)) {
            const slots = await slotsCol.find({ project: project.number }).sort({ number: 1 }).toArray();
            const counts: string[] = [];
            for (const faction of factions) {
                const own = slots.filter((slot) => slot.faction === faction);
                const laidOut = template[faction];
                own.forEach((slot, position) => {
                    // Through JSON, so a range's open end is left off rather than stored as null
                    const options: Record<string, unknown> = JSON.parse(JSON.stringify(laidOut[position] ?? {}));
                    const set = Object.fromEntries(
                        OPTION_KEYS.flatMap((key) => (key in options ? [[key, options[key]]] : []))
                    );
                    const unset = Object.fromEntries(
                        OPTION_KEYS.filter((key) => !(key in options)).map((key) => [key, ""])
                    );
                    slotOperations.push({
                        updateOne: {
                            filter: { project: project.number, number: slot.number },
                            update: {
                                ...(Object.keys(set).length > 0 && { $set: set }),
                                ...(Object.keys(unset).length > 0 && { $unset: unset })
                            }
                        }
                    });
                });
                if (own.length !== laidOut.length) {
                    counts.push(`${faction} ${own.length}/${laidOut.length}`);
                }
            }
            log.info(
                `${dryRun ? "[dry-run] Would apply" : "Applying"} Standard to project #${project.number} (${slots.length} slot(s))` +
                    (counts.length > 0 ? ` - counts differ from the template: ${counts.join(", ")}` : "")
            );
        }

        if (dryRun) {
            return;
        }

        const projectResult = await projectsCol.updateMany(
            { type: "cycle", draft: { $ne: true } },
            { $set: { template: STANDARD } }
        );
        const slotResult = slotOperations.length > 0 ? await slotsCol.bulkWrite(slotOperations) : undefined;
        log.success(
            `Set ${projectResult.modifiedCount} project(s) to Standard and updated ${slotResult?.modifiedCount ?? 0} slot(s)`
        );
    }
};
