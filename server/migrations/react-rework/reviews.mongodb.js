/* eslint-disable react-hooks/rules-of-hooks */
const database = "gotautomation";

use(database);

const reviews = db.getCollection("reviews");
// 1. Fetch all documents into memory (or use a cursor)
console.log("Migration started: Fetching documents...");
const allReviews = reviews.find({ projectId: { $exists: true } }).toArray();
console.log(`Found ${allReviews.length} documents to migrate.`);

const bulkOps = [];

// 2. Transformation Loop
console.log("Transforming data...");
allReviews.forEach(review => {
    try {
        const newDoc = {
            ...review,
            _id: new ObjectId(),
            project: review.projectId,
            created: new Date(Number(review.epoch)),
            updated: new Date(Number(review.epoch)),
            statements: {
                boring: review.statements.boring.toLowerCase(),
                competitive: review.statements.competitive.toLowerCase(),
                creative: review.statements.creative.toLowerCase(),
                balanced: review.statements.balanced.toLowerCase(),
                releasable: review.statements.releasable.toLowerCase()
            }
        };

        // Clean up old/unnecessary properties
        delete newDoc.projectId;
        delete newDoc.epoch;
        delete newDoc.faction;
        delete newDoc.name;

        // Queue the pair of operations
        bulkOps.push({ deleteOne: { filter: { _id: review._id } } });
        bulkOps.push({ insertOne: { document: newDoc } });

    } catch (err) {
        console.error(`Failed to transform document ID: ${review._id}`);
        throw err; // Re-throw to ensure the error appears in your logs
    }
});
console.log(`Transformation complete. Total operations queued: ${bulkOps.length}`);

// 3. Batch Execution Loop
const BATCH_SIZE = 500; // 500 pairs = 1000 operations
console.log(`Starting bulk execution in batches of ${BATCH_SIZE}...`);

for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
    const batch = bulkOps.slice(i, i + BATCH_SIZE);

    // bulkWrite will throw an error if it fails, appearing in your logs
    const result = reviews.bulkWrite(batch, { ordered: true });

    console.log(`Processed batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.insertedCount} inserted, ${result.deletedCount} deleted.`);
}

console.log("Migration successfully completed.");

reviews.createIndex({ project: 1, number: 1, version: 1, reviewer: 1 }, { unique: true });