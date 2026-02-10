/* eslint-disable react-hooks/rules-of-hooks */
const database = "gotautomation";

use(database);

const factionMap = {
    "House Baratheon": "baratheon",
    "House Greyjoy": "greyjoy",
    "House Lannister": "lannister",
    "House Martell": "martell",
    "The Night's Watch": "thenightswatch",
    "House Stark": "stark",
    "House Targaryen": "targaryen",
    "House Tyrell": "tyrell",
    "Neutral": "neutral"
};

const cards = db.getCollection("cards");

console.log("Migration started: Fetching cards...");
const allCards = cards.find({}).toArray();
console.log(`Found ${allCards.length} cards to migrate.`);

const latestMap = {};
const transformedDocs = [];
const bulkOps = [];

// 1. Version Comparison Helper
const compareSemver = (a, b) => {
    const pa = a.split(".");
    const pb = b.split(".");
    for (let i = 0; i < 3; i++) {
        const na = Number(pa[i]);
        const nb = Number(pb[i]);
        if (na > nb) return 1;
        if (nb > na) return -1;
    }
    return 0;
};

// 2. Transformation Loop
console.log("Transforming card data...");
allCards.forEach(card => {
    try {
        const newId = new ObjectId();
        const newDoc = {
            ...card,
            _id: newId,
            project: card.projectId,
            latest: false, // Default to false, will flip later
            draft: !card.playtesting,
            implemented: card.playtesting && (!card.github || card.github?.status === "complete")
        };

        // Faction mapping
        if (newDoc.faction && factionMap[newDoc.faction]) {
            newDoc.faction = factionMap[newDoc.faction];
        }

        // Lowercasing
        if (newDoc.type) newDoc.type = newDoc.type.toLowerCase();

        if (newDoc.note?.type) {
            newDoc.note.type = newDoc.note.type.toLowerCase();
        }

        // Data cleanup
        if (newDoc.text) {
            newDoc.text = newDoc.text.replace(/\r/g, "");
        }

        // Remove old properties
        delete newDoc.projectId;
        delete newDoc["note.type"];

        // Track the latest version for each unique card (project + number)
        const key = `${newDoc.project}-${newDoc.number}`;
        if (!latestMap[key] || compareSemver(newDoc.version, latestMap[key].version) > 0) {
            latestMap[key] = { id: newId, version: newDoc.version };
        }

        transformedDocs.push({ oldId: card._id, newDoc });

    } catch (err) {
        console.error(`Error transforming card _id: ${card._id}`);
        throw err;
    }
});

// 3. Finalize 'latest' status and build Bulk Operations
console.log("Finalizing version flags...");
const latestIds = new Set(Object.values(latestMap).map(v => v.id.toString()));

transformedDocs.forEach(({ oldId, newDoc }) => {
    if (latestIds.has(newDoc._id.toString())) {
        newDoc.latest = true;
    }

    bulkOps.push({ deleteOne: { filter: { _id: oldId } } });
    bulkOps.push({ insertOne: { document: newDoc } });
});

// 4. Batch Execution Loop
const BATCH_SIZE = 500;
console.log(`Executing ${bulkOps.length} operations in batches of ${BATCH_SIZE}...`);

for (let i = 0; i < bulkOps.length; i += (BATCH_SIZE * 2)) {
    // We multiply by 2 because each "batch" of 500 cards is 1000 operations (1 delete + 1 insert)
    const batch = bulkOps.slice(i, i + (BATCH_SIZE * 2));

    const result = cards.bulkWrite(batch, { ordered: true });

    console.log(`Processed batch ${Math.floor(i / (BATCH_SIZE * 2)) + 1}: ${result.insertedCount} inserted, ${result.deletedCount} deleted.`);
}

console.log("Card migration successfully completed.");

cards.createIndex({ project: 1, number: 1, version: 1 }, { unique: true });