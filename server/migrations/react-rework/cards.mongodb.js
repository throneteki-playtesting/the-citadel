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

const latest = {};
cards.find({}).forEach(card => {
    // Faction mapping
    if (card.faction && factionMap[card.faction]) {
        card.faction = factionMap[card.faction];
    }

    // Lowercase type
    if (card.type) {
        card.type = card.type.toLowerCase();
    }

    // Lowercase note.type
    if (card.note?.type) {
        card.note.type = card.note.type.toLowerCase();
        delete card["note.type"];
    }

    // Rename projectId to project
    if (card.projectId) {
        card.project = card.projectId;
        delete card.projectId;
    }

    // Clean \r from card text
    if (card.text) {
        card.text = card.text.replace("\r", "");
    }

    // Replace _id with new ObjectId
    const newId = new ObjectId();

    // Set draft (is draft if no playtesting version set)
    card.draft = !card.playtesting;

    // Set latest (will set true in next loop)
    card.latest = false;
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
    const key = `${card.project}-${card.number}`;
    if (!latest[key] || compareSemver(card.version, latest[key].version) > 0) {
        latest[key] = { ...card, _id: newId };
    }

    // Apply update
    cards.deleteOne({ _id: card._id });
    const { project, ...other } = card;
    cards.insertOne({
        project,
        ...other,
        _id: newId
    });
});

// Set all latest to true
Object.values(latest).forEach(card => {
    cards.updateOne({ _id: card._id }, { $set: { latest: true } });
});

cards.createIndex({ project: 1, number: 1, version: 1 }, { unique: true });