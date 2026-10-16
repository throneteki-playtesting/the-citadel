import { Collection, Document } from "mongodb";

// Well clear of any real number, so the new numbers - which overlap the old - never meet an old one
const OFFSET = 1_000_000;

// Renumbers in two passes - all lifted out of the way, then each set down. Every number held must be in `numbers`
export async function renumberDocuments(
    collection: Collection<Document>,
    project: number,
    numbers: Map<number, number>,
    changes: (to: number) => Document
) {
    await collection.updateMany({ project }, [{ $set: { number: { $add: ["$number", OFFSET] } } }]);
    await collection.bulkWrite(
        [...numbers].map(([from, to]) => ({
            updateMany: { filter: { project, number: from + OFFSET }, update: { $set: { number: to, ...changes(to) } } }
        })),
        { ordered: true }
    );
}
