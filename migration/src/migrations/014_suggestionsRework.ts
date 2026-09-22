import { AnyBulkWriteOperation, Db, Document } from "mongodb";
import { Migration } from "../lib/types";
import { log, createProgress } from "../lib/logger";
import { deriveFields } from "../../../common/designGuidelines/deriveFields";

const BATCH_SIZE = 500;

const USED_FOR_PROJECT_REGEX = /^Used for (\S+) card #(\d+)$/;

// Placeholder seed data for the new settings-backed reward/punishment registry, copied from the
// now-deleted rewardTypes.ts - replace these *_SEED arrays in place once a real list arrives.
const REWARD_TYPES_SEED: { id: string; label: string; description: string; examples: string[]; tags: string[] }[] = [
    {
        id: "gainsGold",
        label: "Gains Gold",
        description: "Adds gold to a player's pool",
        examples: ['Antler Men: "gain 1 gold"'],
        tags: ["gold", "economy", "income"]
    },
    {
        id: "drawsCards",
        label: "Draws Cards",
        description: "Draws cards from a deck",
        examples: ['Jon Arryn: "draw 2 cards"'],
        tags: ["draw", "cards", "card advantage"]
    },
    {
        id: "modifyIncome",
        label: "Modifies Income",
        description: "Changes a plot's income value",
        examples: ['Lannisport: "+1 Income"'],
        tags: ["gold", "income", "plot"]
    },
    {
        id: "modifyInitiative",
        label: "Modifies Initiative",
        description: "Changes a plot's initiative value",
        examples: ['The Wolfswood: "+1 Initiative"'],
        tags: ["initiative", "plot"]
    },
    {
        id: "modifyClaim",
        label: "Modifies Claim",
        description: "Changes a plot's claim value, or swaps which claim type applies",
        examples: ['Trial by Combat: "apply military claim instead"'],
        tags: ["claim", "plot"]
    },
    {
        id: "modifyReserve",
        label: "Modifies Reserve",
        description: "Changes a plot's reserve value",
        examples: ['Stony Shore Thrall: "reduce the reserve value...by 1"'],
        tags: ["reserve", "plot"]
    },
    {
        id: "reducesCosts",
        label: "Reduces Costs",
        description: "Lowers what a player pays to marshal/play a card",
        examples: ['Squire: "reduce the cost of the next Army...by 1"'],
        tags: ["discount", "cost reduction"]
    },
    {
        id: "goldOnCards",
        label: "Gold-on-Card Tokens",
        description: "Places or removes gold tokens on a card (its own sub-economy, distinct from the gold pool)",
        examples: ['Ashemark Councilor: "each of those cards gains 1 gold"'],
        tags: ["gold token", "economy"]
    },
    {
        id: "statModification",
        label: "Stat Modification",
        description: "Changes a character's STR or a card's printed cost",
        examples: ['Grey Worm\'s Spear: "each defending character gets -1 STR"'],
        tags: ["buff", "debuff", "str", "strength"]
    },
    {
        id: "iconManipulation",
        label: "Icon Manipulation",
        description: "Adds or removes challenge icons",
        examples: ['The Blackfish: "gains an intrigue icon"'],
        tags: ["icon", "challenge icon"]
    },
    {
        id: "keywordGranting",
        label: "Keyword Granting/Removal",
        description: "Grants or strips a keyword",
        examples: ['Support of Saltcliffe: "gains stealth"'],
        tags: ["keyword", "grant", "strip keyword"]
    },
    {
        id: "traitOrFactionModification",
        label: "Trait/Faction Modification",
        description: "Grants/removes a trait, or changes faction affiliation",
        examples: ['The Wall: "gains the Night\'s Watch affiliation and loses all other faction affiliations"'],
        tags: ["trait", "faction", "affiliation"]
    },
    {
        id: "kneelOrStand",
        label: "Kneel or Stand",
        description: "Kneels or stands a card",
        examples: ['Lordsport Shipwright: "choose and kneel a location"'],
        tags: ["kneel", "stand", "tap", "untap"]
    },
    {
        id: "challengeParticipation",
        label: "Challenge Participation",
        description: "Adds/removes a character from a challenge, or suppresses its STR contribution",
        examples: ['Mace Tyrell: "remove it from the challenge"'],
        tags: ["challenge", "participation"]
    },
    {
        id: "extraChallengeOrAction",
        label: "Extra Challenge/Action",
        description: "Grants an additional challenge, marshal, or play opportunity",
        examples: ['A Storm of Swords: "initiate an additional military challenge"'],
        tags: ["extra action", "additional challenge"]
    },
    {
        id: "removalOrKill",
        label: "Removal or Kill",
        description: "Kills a character or discards a card from play",
        examples: ["Ser Willam Wells (kill effect)"],
        tags: ["kill", "removal", "discard from play"]
    },
    {
        id: "returnToHand",
        label: "Return to Hand (Bounce)",
        description: "Returns a card to its owner's hand, without killing it",
        examples: ['The Father: "return each of those characters to its owner\'s hand"'],
        tags: ["bounce", "return"]
    },
    {
        id: "recursion",
        label: "Recursion",
        description: "Returns a card from discard/dead pile into play or hand",
        examples: ['Burning Bright: "put an Army or Knight character into play from your discard pile"'],
        tags: ["recur", "reanimate", "from discard"]
    },
    {
        id: "cheatIntoPlay",
        label: "Cheat Into Play",
        description: "Puts a card into play outside normal marshaling",
        examples: ['Hear Me Roar!: "put a Lannister character into play from your hand"'],
        tags: ["cheat", "free play", "put into play"]
    },
    {
        id: "controlChange",
        label: "Control Change",
        description: "Changes who controls a card, without it leaving play",
        examples: ['Winterfell: "take control of that character"'],
        tags: ["steal", "control", "take"]
    },
    {
        id: "zoneMovement",
        label: "Zone Movement",
        description: "Moves a card to/from a non-play zone (shadows, removed from game)",
        examples: ['Journey to Oldtown: "remove it from the game until the beginning of the next plot phase"'],
        tags: ["shadows", "exile", "remove from game"]
    },
    {
        id: "attachmentManipulation",
        label: "Attachment Manipulation",
        description: "Attaches, moves, or detaches an attachment",
        examples: ['Arya\'s Gift: "move an attachment...to another eligible character"'],
        tags: ["attachment", "move attachment"]
    },
    {
        id: "searchOrTutor",
        label: "Search or Tutor",
        description: "Searches the deck for a specific card",
        examples: ['Muster: "search your deck for a Knight character"'],
        tags: ["search", "tutor", "deck search"]
    },
    {
        id: "deckManipulation",
        label: "Deck Manipulation",
        description: "Looks at, reorders, or mills cards from a deck",
        examples: ['Doran Martell: "look at the top 2 cards of your deck"'],
        tags: ["deck", "mill", "reorder", "scry"]
    },
    {
        id: "handDisruption",
        label: "Hand Disruption",
        description: "Forces discard from, or reveals, an opponent's hand",
        examples: ['Heads on Spikes: "discard 1 card at random from that player\'s hand"'],
        tags: ["discard", "hand attack"]
    },
    {
        id: "protection",
        label: "Protection",
        description: "Standing immunity from being killed/targeted",
        examples: ["Valyrian Steel Armor"],
        tags: ["immune", "cannot be killed"]
    },
    {
        id: "saveEffect",
        label: "Save Effect",
        description: "Reactively rescues a card that would be killed/discarded",
        examples: ['Ghost: "sacrifice Ghost to save him"'],
        tags: ["save", "rescue", "prevent death"]
    },
    {
        id: "denialOrRestriction",
        label: "Denial/Restriction",
        description: "Forbids a player from taking an action",
        examples: ['Marching Orders: "you cannot marshal locations or attachments"'],
        tags: ["restrict", "deny", "lockdown"]
    },
    {
        id: "cancelOrNegate",
        label: "Cancel/Negate",
        description: "Cancels a triggered ability or event before it resolves",
        examples: ['The Hand\'s Judgment: "cancel those effects"'],
        tags: ["cancel", "counter", "negate"]
    },
    {
        id: "abilityBlanking",
        label: "Ability Blanking",
        description: "Treats a card's printed text as blank",
        examples: ['Fortified Position: "treat each character as if its printed text box were blank"'],
        tags: ["blank", "silence", "text removal"]
    },
    {
        id: "powerManipulation",
        label: "Power Manipulation",
        description: "Adds, removes, or moves power",
        examples: ['Tyene Sand: "move 1 power from the winning opponent\'s faction card to a character you control"'],
        tags: ["power", "move power"]
    }
];

const PUNISHMENT_TYPES_SEED: { id: string; label: string; description: string; examples: string[]; tags: string[] }[] =
    [
        {
            id: "symmetricBacklash",
            label: "Hits You Too",
            description: "Non-discriminating effect hits every player/card, including your own",
            examples: ['Valar Morghulis: "Kill each character"'],
            tags: ["board wipe", "symmetric"]
        },
        {
            id: "restrictedAction",
            label: "Restricted Action",
            description: "Forbidden from something you'd normally want to do",
            examples: ['Sneak Attack: "You cannot initiate more than 1 challenge"'],
            tags: ["restriction", "cannot"]
        },
        {
            id: "statPenalty",
            label: "Reduced Stats/Plot Values",
            description: "A printed negative modifier on the card itself",
            examples: ['Winterfell: "-2 Initiative"'],
            tags: ["debuff", "negative stat"]
        },
        {
            id: "deploymentRestriction",
            label: "Deployment/Attachment Restriction",
            description: "Can't be enhanced, duplicated, or only attaches narrowly",
            examples: ['The Holy Hundred: "No attachments except Weapon"'],
            tags: ["no attachments", "restriction"]
        },
        {
            id: "stayKnelt",
            label: "Stays Knelt / Enters Knelt",
            description: "Denied normal readiness",
            examples: ['Sansa Stark: "enters play knelt"'],
            tags: ["knelt", "enters knelt"]
        },
        {
            id: "selfKill",
            label: "Kill Your Own Character",
            description: "Forces killing one of your own characters as a consequence",
            examples: ['Ser Gregor Clegane: "choose and kill a character you control"'],
            tags: ["self kill", "sacrifice"]
        },
        {
            id: "selfBounce",
            label: "Removes Itself From the Board",
            description: "Undoes its own presence after delivering value",
            examples: ['Arianne Martell: "return Arianne Martell to your hand (cannot be saved)"'],
            tags: ["bounce itself", "returns to hand"]
        },
        {
            id: "upkeep",
            label: "Ongoing Upkeep or It Dies",
            description: "Must be continuously fed or it sacrifices/leaves",
            examples: ['Second Sons: "sacrifice Second Sons unless you discard 1 gold from it"'],
            tags: ["upkeep", "maintenance cost"]
        },
        {
            id: "cedeControl",
            label: "Hand It to an Opponent",
            description: "The card (or another) changes control to an opponent",
            examples: ['The Frostfangs: "give control of it to an opponent"'],
            tags: ["cede control", "give control"]
        },
        {
            id: "openToOpponents",
            label: "Anyone May Use It",
            description: "Ability is explicitly usable by any player",
            examples: ['Bronn: "(Any player may initiate this ability.)"'],
            tags: ["any player", "shared ability"]
        },
        {
            id: "opponentGainsValue",
            label: "Opponent Gains Value",
            description: "Resolving it hands opponents cards/gold/power (includes the Prized (X) keyword)",
            examples: ['Theon Greyjoy: "each opponent gains 2 power for their faction"'],
            tags: ["opponent benefit", "prized"]
        },
        {
            id: "opponentDecides",
            label: "Opponent Picks the Outcome",
            description: "An opponent chooses which branch resolves",
            examples: ['Poor Fellows: "the losing opponent chooses"'],
            tags: ["opponent chooses", "loses control of outcome"]
        },
        {
            id: "selfDiscard",
            label: "Discard Your Own Cards",
            description: "Lose hand cards (often randomly) as a consequence",
            examples: ['Moon Boy: "discard 1 card at random from your hand"'],
            tags: ["self discard", "hand loss"]
        },
        {
            id: "selfMill",
            label: "Burn Your Own Deck",
            description: "Cards discarded/reordered from your own deck as the cost of payoff",
            examples: ['Chiswyck: "discard the top card of your deck"'],
            tags: ["self mill", "deck loss"]
        },
        {
            id: "increasedFragility",
            label: "Harder to Protect",
            description: 'Explicitly waives normal "cannot be saved" protection',
            examples: ['Jon Arryn: "cannot be saved"'],
            tags: ["cannot be saved", "fragile"]
        },
        {
            id: "conditionalRisk",
            label: "Punished If It Doesn't Work",
            description: "A gamble - failing costs you on top of not getting the effect",
            examples: ['Choosing the Spear: "if you lose the challenge, choose and kill a character you control"'],
            tags: ["gamble", "risk"]
        },
        {
            id: "revealInformation",
            label: "Reveal Your Hand",
            description: "Forces revealing your own hand",
            examples: ['No Surprises: "reveal your hand" (rare - 2 known cards)'],
            tags: ["reveal hand", "information"]
        },
        {
            id: "selfBlanking",
            label: "Blanks Its Own Text",
            description: "The card can pay to blank its own printed text",
            examples: ["Tycho Nestoris (rare - 1 known card)"],
            tags: ["blank itself", "self-silence"]
        }
    ];

async function seedSuggestionsSettings(destDb: Db, dryRun: boolean) {
    const collection = destDb.collection("settings");
    const existing = await collection.findOne({ type: "suggestions" });
    if (existing) {
        log.info("Suggestions settings already seeded - skipping");
        return;
    }

    if (dryRun) {
        log.info("[dry-run] Would seed a suggestions settings document");
        return;
    }

    const now = new Date();
    await collection.insertOne({
        id: crypto.randomUUID(),
        type: "suggestions",
        data: {
            minimumLikesThreshold: 3,
            loyaltyTags: [],
            rewardTypes: REWARD_TYPES_SEED.map((entry) => ({ ...entry, enabled: true })),
            punishmentTypes: PUNISHMENT_TYPES_SEED.map((entry) => ({ ...entry, enabled: true }))
        },
        created: now,
        createdBy: "system",
        updated: now,
        updatedBy: "system"
    });
    log.success("Seeded suggestions settings (minimumLikesThreshold, rewardTypes, punishmentTypes, loyaltyTags)");
}

export const migration: Migration = {
    name: "014_suggestionsRework",
    description:
        "Reshapes suggestions for the suggestions rework: adds draft/questions/derived/checklistJustifications/" +
        "pivotPoints/comparableCards/combosWith, drops the old free-text tags field and threadId, converts " +
        "archivedReason (string) into a structured archived object, and moves likedBy/approvedBy/approvedAt " +
        "under _metadata.engagement as Like/Dislike/Ignore reactions (normalizing any bare-discordId-array " +
        "likedBy entries along the way); also seeds a settings document for suggestions (minimumLikesThreshold, " +
        "rewardTypes, punishmentTypes, loyaltyTags), replacing the old static reward/punishment type registries, " +
        "and reintroduces `tags` as the (empty, since questions.rewardTypes/punishment are also reset here) " +
        "server-computed union of the newly-empty selection's reward/punishment tags",

    async run({ destDb, dryRun }) {
        await seedSuggestionsSettings(destDb, dryRun);

        const collection = destDb.collection("suggestions");
        const docs = await collection.find({}).toArray();

        if (docs.length === 0) {
            log.info("Nothing to migrate");
            return;
        }

        const ops: AnyBulkWriteOperation<Document>[] = docs.map((doc) => {
            const set: Record<string, unknown> = {
                draft: true,
                questions: {
                    rewardTypes: [],
                    punishment: [],
                    iconic: false
                },
                derived: deriveFields(doc.card?.text ?? ""),
                // Reuses a field name an older, unrelated "tags" concept occupied (dropped below) - set
                // here, not left to `unset`, since Mongo refuses a single update that does both to one path.
                tags: [],
                checklistJustifications: {},
                pivotPoints: [],
                comparableCards: [],
                combosWith: []
            };
            const unset: Record<string, string> = { threadId: "" };

            if (typeof doc.archivedReason === "string") {
                const match = USED_FOR_PROJECT_REGEX.exec(doc.archivedReason);
                set.archived = match
                    ? {
                          reason: "usedInProject",
                          project: { code: match[1], number: Number(match[2]) },
                          archivedAt: doc.updated ?? new Date()
                      }
                    : {
                          reason: "other",
                          details: doc.archivedReason,
                          archivedAt: doc.updated ?? new Date()
                      };
                unset.archivedReason = "";
            }

            // likedBy was a bare discordId array before it grew a votedAt; either shape becomes a
            // "like" reaction here, since that was the only reaction type that existed before this.
            const likedBy = ((doc.likedBy ?? []) as unknown[]).map((entry) =>
                typeof entry === "string" ? { discordId: entry, votedAt: doc.updated ?? new Date() } : entry
            ) as { discordId: string; votedAt: Date }[];
            const engagement: Record<string, unknown> = {
                reactions: Object.fromEntries(
                    likedBy.map(({ discordId, votedAt }) => [discordId, { type: "like", reactedAt: votedAt }])
                )
            };
            if (doc.approvedBy) {
                engagement.approvedBy = doc.approvedBy;
                engagement.approvedAt = doc.approvedAt ?? doc.updated ?? new Date();
            }
            set["_metadata.engagement"] = engagement;
            Object.assign(unset, { likedBy: "", approvedBy: "", approvedAt: "" });

            return { updateOne: { filter: { _id: doc._id }, update: { $set: set, $unset: unset } } };
        });

        log.info(`${ops.length} suggestion document(s) will be migrated`);

        if (dryRun) {
            log.info(`[dry-run] Would update ${ops.length} document(s)`);
            return;
        }

        const progress = createProgress("suggestions");
        let done = 0;
        for (let i = 0; i < ops.length; i += BATCH_SIZE) {
            const batch = ops.slice(i, i + BATCH_SIZE);
            await collection.bulkWrite(batch, { ordered: false });
            done += batch.length;
            progress.counter(done, ops.length);
        }
        progress.done(`${done} migrated`);

        log.success(`Suggestions rework migration complete - ${done} document(s) updated`);
    }
};
