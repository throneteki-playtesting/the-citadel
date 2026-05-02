/* eslint-disable react-hooks/rules-of-hooks */
const database = "gotautomation";

use(database);

const projects = db.getCollection("projects");

console.log("Migration started: Fetching projects...");
const allProjects = projects.find({}).toArray();
console.log(`Found ${allProjects.length} projects to migrate.`);

const bulkOps = [];

const now = new Date();
const userId = "120834530801221634";

// 1. Transformation Loop
console.log("Transforming project data...");
allProjects.forEach(project => {
    try {
        const newId = new ObjectId();

        const newDoc = {
            ...project,
            _id: newId,
            number: project.code,
            code: project.short,
            type: project.type.toLowerCase(),
            version: project.releases,
            created: now,
            createdBy: userId,
            updated: now,
            updatedBy: userId,
            draft: !project.active,
            cardCount: {
                baratheon: project.perFaction,
                greyjoy: project.perFaction,
                lannister: project.perFaction,
                martell: project.perFaction,
                thenightswatch: project.perFaction,
                stark: project.perFaction,
                targaryen: project.perFaction,
                tyrell: project.perFaction,
                neutral: project.neutral
            },
            // Clean up emoji (remove start/end colons)
            emoji: project.emoji ? project.emoji.replaceAll(":", "") : ""
        };

        // Remove old/renamed properties
        delete newDoc.short;
        delete newDoc.releases;
        delete newDoc.perFaction;
        delete newDoc.neutral;

        // Queue operations (Delete old, Insert new)
        bulkOps.push({ deleteOne: { filter: { _id: project._id } } });
        bulkOps.push({ insertOne: { document: newDoc } });

    } catch (err) {
        console.error(`Error transforming project _id: ${project._id}`);
        throw err; // Standard unsuppressed error logging
    }
});

// 2. Batch Execution Loop
const BATCH_SIZE = 500;
console.log(`Executing bulk operations in batches of ${BATCH_SIZE}...`);

for (let i = 0; i < bulkOps.length; i += (BATCH_SIZE * 2)) {
    const batch = bulkOps.slice(i, i + (BATCH_SIZE * 2));

    const result = projects.bulkWrite(batch, { ordered: true });

    // Safety check for driver-specific count properties
    const inserted = result.insertedCount || result.nInserted || 0;
    const deleted = result.deletedCount || result.nRemoved || 0;

    console.log(`Processed batch ${Math.floor(i / (BATCH_SIZE * 2)) + 1}: ${inserted} inserted, ${deleted} deleted.`);
}

console.log("Project migration successfully completed.");

projects.createIndex({ number: 1 }, { unique: true });