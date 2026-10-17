import { AnyBulkWriteOperation, Db, Document } from "mongodb";
import { Migration } from "../lib/types";
import { log, createProgress } from "../lib/logger";
import { deriveFields } from "../../../common/designGuidelines/deriveFields";

const BATCH_SIZE = 500;

const USED_FOR_PROJECT_REGEX = /^Used for (\S+) card #(\d+)$/;

// Seed for the reward/downside registry - see common/designGuidelines/suggestionTags for the tag kinds
interface OptionSeed {
    label: string;
    description: string;
    aspects: string[];
    archetypes: string[];
    keywords?: string[];
    requiresLoyalty?: boolean;
}

const REWARD_OPTIONS_SEED: OptionSeed[] = [
    {
        label: "Gains Gold",
        description: "Adds gold to a player's pool",
        aspects: ["economy"],
        archetypes: ["good stuff"]
    },
    {
        label: "Reduces Your Costs",
        description: "Lowers what you pay to marshal or play a card",
        aspects: ["economy"],
        archetypes: ["good stuff"]
    },
    {
        label: "Gold-on-Card Tokens",
        description: "Places gold tokens on a card (its own economy, distinct from the gold pool)",
        aspects: ["economy"],
        archetypes: ["good stuff"],
        keywords: ["Bestow"]
    },
    {
        label: "Raises Your Income",
        description: "Increases the income value of a plot you control",
        aspects: ["economy", "plot manipulation"],
        archetypes: ["good stuff"]
    },
    {
        label: "Denies Opponent Gold",
        description: "Lowers an opponent's income, takes their gold, or raises what they pay",
        aspects: ["economy", "plot manipulation"],
        archetypes: ["choke"]
    },
    {
        label: "Draws Cards",
        description: "Draws cards from your deck",
        aspects: ["draw", "card advantage"],
        archetypes: ["attrition"],
        keywords: ["Insight"]
    },
    {
        label: "Denies Opponent Draw",
        description: "Stops an opponent drawing cards, or makes them draw fewer",
        aspects: ["draw"],
        archetypes: ["choke"]
    },
    {
        label: "Raises Your Reserve",
        description: "Increases the reserve value of a plot you control",
        aspects: ["hand size", "plot manipulation"],
        archetypes: ["attrition"]
    },
    {
        label: "Lowers Opponent's Reserve",
        description: "Decreases the reserve value of an opponent's plot",
        aspects: ["hand size", "plot manipulation"],
        archetypes: ["choke"]
    },
    {
        label: "Discards From Opponent's Hand",
        description: "Forces an opponent to discard cards from their hand",
        aspects: ["hand disruption", "card advantage"],
        archetypes: ["choke"]
    },
    {
        label: "Reveals Opponent's Hand",
        description: "Reveals or looks at an opponent's hand",
        aspects: ["information"],
        archetypes: ["control"]
    },
    {
        label: "Mills Opponent's Deck",
        description: "Discards cards from the top of an opponent's deck",
        aspects: ["deck disruption"],
        archetypes: ["choke"],
        keywords: ["Pillage"]
    },

    {
        label: "Searches Your Deck",
        description: "Searches your deck for a specific card",
        aspects: ["deck manipulation"],
        archetypes: ["combo"]
    },
    {
        label: "Looks At Your Deck",
        description: "Looks at or reorders the top of your deck",
        aspects: ["deck manipulation"],
        archetypes: ["combo"]
    },
    {
        label: "Recurs to Hand",
        description: "Returns a card from your discard or dead pile to your hand",
        aspects: ["recursion", "card advantage"],
        archetypes: ["attrition"]
    },
    {
        label: "Recurs Into Play",
        description: "Puts a card into play from your discard or dead pile",
        aspects: ["recursion", "put into play"],
        archetypes: ["attrition", "tempo"]
    },
    {
        label: "Puts Into Play From Hand",
        description: "Puts a card into play from your hand outside normal marshaling",
        aspects: ["put into play"],
        archetypes: ["tempo"],
        keywords: ["Ambush"]
    },
    {
        label: "Shadows Movement",
        description: "Moves a card into or out of shadows",
        aspects: ["zone movement"],
        archetypes: ["shadows"],
        keywords: ["Shadow"]
    },
    {
        label: "Modifies Initiative",
        description: "Changes a plot's initiative value",
        aspects: ["initiative", "plot manipulation"],
        archetypes: ["tempo"]
    },
    {
        label: "Plot Deck Manipulation",
        description: "Chooses, reuses or recycles plot cards",
        aspects: ["plot deck"],
        archetypes: ["combo"]
    },

    {
        label: "Gains Power From Challenges",
        description: "Gains power for winning or taking part in challenges",
        aspects: ["power gain"],
        archetypes: ["rush"],
        keywords: ["Renown"]
    },
    {
        label: "Gains Power Outside Challenges",
        description: "Gains power without needing to win a challenge",
        aspects: ["power gain"],
        archetypes: ["passive"]
    },
    {
        label: "Moves Opponent's Power to You",
        description: "Takes power from an opponent's card and gives it to yours",
        aspects: ["power manipulation", "power gain"],
        archetypes: ["rush", "control"]
    },
    {
        label: "Discards Opponent's Power",
        description: "Removes power from an opponent's cards",
        aspects: ["power manipulation"],
        archetypes: ["control"]
    },
    {
        label: "Dominance Bonus",
        description: "Adds to your dominance, or rewards winning it",
        aspects: ["dominance"],
        archetypes: ["passive"]
    },
    {
        label: "Unopposed Bonus",
        description: "Rewards winning a challenge unopposed",
        aspects: ["unopposed"],
        archetypes: ["aggro"]
    },

    {
        label: "Boosts One Character's STR",
        description: "Raises the STR of a single character",
        aspects: ["challenge strength"],
        archetypes: ["go tall"]
    },
    {
        label: "Boosts Each Character's STR",
        description: "Raises the STR of every character in a group",
        aspects: ["challenge strength"],
        archetypes: ["go wide"]
    },
    {
        label: "Reduces STR",
        description: "Lowers the STR of a character, possibly killing it",
        aspects: ["challenge strength"],
        archetypes: ["burn", "control"]
    },
    {
        label: "Gains Icons",
        description: "Gives a character a challenge icon",
        aspects: ["icons"],
        archetypes: ["aggro"]
    },
    {
        label: "Removes Icons",
        description: "Removes a challenge icon from a character",
        aspects: ["icons"],
        archetypes: ["control"]
    },
    {
        label: "Adds to a Challenge",
        description: "Adds a character to a challenge",
        aspects: ["challenge participation"],
        archetypes: ["tempo"]
    },
    {
        label: "Removes From a Challenge",
        description: "Removes a character from a challenge, or stops its STR counting",
        aspects: ["challenge participation"],
        archetypes: ["control"]
    },
    {
        label: "Evasion",
        description: "Gets past defenders - stealth, or a character that cannot be declared as a defender",
        aspects: ["evasion"],
        archetypes: ["aggro"],
        keywords: ["Stealth"]
    },
    {
        label: "Extra Challenge",
        description: "Grants an additional challenge",
        aspects: ["extra challenges"],
        archetypes: ["aggro"]
    },
    {
        label: "Increases Claim",
        description: "Raises the claim value of a challenge you win",
        aspects: ["claim"],
        archetypes: ["aggro"]
    },
    {
        label: "Reduces Claim",
        description: "Lowers the claim value of a challenge an opponent wins",
        aspects: ["claim"],
        archetypes: ["defensive"]
    },
    {
        label: "Changes Claim Type",
        description: "Swaps which claim type applies",
        aspects: ["claim"],
        archetypes: ["aggro"]
    },
    {
        label: "Prevents Challenges Against You",
        description: "Stops opponents challenging you, or limits how they can",
        aspects: ["restriction", "challenge participation"],
        archetypes: ["defensive"]
    },

    {
        label: "Kills a Character",
        description: "Kills a character",
        aspects: ["kill"],
        archetypes: ["control"]
    },
    {
        label: "Discards a Card From Play",
        description: "Discards a location, attachment or other card from play",
        aspects: ["discard from play"],
        archetypes: ["control"]
    },
    {
        label: "Removes From Game",
        description: "Removes a card from the game",
        aspects: ["zone movement"],
        archetypes: ["control"]
    },
    {
        label: "Returns Opponent's Card to Hand",
        description: "Returns an opponent's card to their hand, without killing it",
        aspects: ["bounce"],
        archetypes: ["tempo"]
    },
    {
        label: "Takes Control",
        description: "Takes control of a card without it leaving play",
        aspects: ["control change", "card advantage"],
        archetypes: ["control"]
    },
    {
        label: "Kneels Opponent's Card",
        description: "Kneels a card an opponent controls",
        aspects: ["kneel"],
        archetypes: ["tempo"],
        keywords: ["Intimidate", "Assault"]
    },
    {
        label: "Stands Your Card",
        description: "Stands a card you control",
        aspects: ["stand"],
        archetypes: ["tempo", "defensive"]
    },
    {
        label: "Blanks Text",
        description: "Treats a card's printed text box as blank",
        aspects: ["blanking"],
        archetypes: ["control"],
        keywords: ["Assault"]
    },
    {
        label: "Grants a Keyword",
        description: "Gives a card a keyword",
        aspects: ["keyword manipulation"],
        archetypes: ["good stuff"]
    },
    {
        label: "Removes a Keyword",
        description: "Takes a keyword away from a card",
        aspects: ["keyword manipulation"],
        archetypes: ["control"]
    },
    {
        label: "Gains Trait/Affiliation",
        description: "Gives a card a trait or a faction affiliation",
        aspects: ["trait manipulation"],
        archetypes: ["tribal"]
    },
    {
        label: "Removes Trait/Affiliation",
        description: "Takes a trait or faction affiliation away from a card",
        aspects: ["trait manipulation"],
        archetypes: ["control"]
    },
    {
        label: "Attaches an Attachment",
        description: "Plays or attaches an attachment from outside the normal marshaling",
        aspects: ["attachments"],
        archetypes: ["go tall"]
    },
    {
        label: "Moves an Attachment",
        description: "Moves an attachment to another card, or detaches it",
        aspects: ["attachments"],
        archetypes: ["tempo"]
    },
    {
        label: "Grants Immunity",
        description: "Makes a card immune to being killed, discarded or targeted",
        aspects: ["protection"],
        archetypes: ["go tall"]
    },
    {
        label: "Saves From Leaving Play",
        description: "Rescues a card that would be killed or discarded",
        aspects: ["protection"],
        archetypes: ["attrition"]
    },
    {
        label: "Cancels",
        description: "Cancels a triggered ability or event before it resolves",
        aspects: ["cancel"],
        archetypes: ["control"]
    },
    {
        label: "Restricts Opponent's Plays",
        description: "Forbids an opponent from marshaling or playing certain cards, or taking an action",
        aspects: ["restriction"],
        archetypes: ["choke"]
    }
];

// A downside's archetype is the deck where it costs least
const DOWNSIDE_OPTIONS_SEED: OptionSeed[] = [
    {
        label: "Hits You Too",
        description: "A non-discriminating effect which hits every player's cards, including your own",
        aspects: ["symmetric"],
        archetypes: ["control"]
    },
    {
        label: "Restricted Action",
        description: "Forbidden from something you'd normally want to do",
        aspects: ["tempo loss"],
        archetypes: []
    },
    {
        label: "Stays Knelt / Enters Knelt",
        description: "Enters play knelt, or doesn't stand as normal",
        aspects: ["tempo loss"],
        archetypes: []
    },
    {
        label: "Reduced Stats/Plot Values",
        description: "Lowers a character's STR or a plot's values",
        aspects: ["stat penalty"],
        archetypes: []
    },
    {
        label: "Deployment Restriction",
        description: "Limits how and how often it can be put into play or attached to",
        aspects: ["deployment limit"],
        archetypes: [],
        keywords: ["Limited"]
    },
    {
        label: "Kill Your Own Character",
        description: "Requires killing or sacrificing a character you control",
        aspects: ["self sacrifice"],
        archetypes: ["go wide"]
    },
    {
        label: "Removes Itself From the Board",
        description: "Returns itself to hand or leaves play",
        aspects: ["self sacrifice"],
        archetypes: []
    },
    {
        label: "Discard Your Own Cards",
        description: "Requires discarding cards from your own hand",
        aspects: ["self sacrifice"],
        archetypes: []
    },
    {
        label: "Burn Your Own Deck",
        description: "Discards cards from the top of your own deck",
        aspects: ["self sacrifice"],
        archetypes: []
    },
    {
        label: "Ongoing Upkeep or It Dies",
        description: "Must be paid for each round, or it leaves play",
        aspects: ["upkeep"],
        archetypes: []
    },
    {
        label: "Hand It to an Opponent",
        description: "Control of the card passes to an opponent",
        aspects: ["opponent benefit"],
        archetypes: []
    },
    {
        label: "Anyone May Use It",
        description: "Its ability can be used by any player",
        aspects: ["opponent benefit"],
        archetypes: []
    },
    {
        label: "Opponent Gains Value",
        description: "An opponent gains something from it, such as gold, power or cards",
        aspects: ["opponent benefit"],
        archetypes: [],
        keywords: ["Prized"]
    },
    {
        label: "Opponent Picks the Outcome",
        description: "An opponent chooses the target or result",
        aspects: ["opponent benefit"],
        archetypes: []
    },
    {
        label: "Reveal Your Hand",
        description: "Reveals your hand to an opponent",
        aspects: ["opponent benefit"],
        archetypes: []
    },
    {
        label: "Harder to Protect",
        description: "Cannot be saved, or is discarded instead of returning to hand",
        aspects: ["fragile"],
        archetypes: [],
        keywords: ["Terminal"]
    },
    {
        label: "Backfires If It Doesn't Work",
        description: "Has a penalty if its condition isn't met or its gamble fails",
        aspects: ["risk"],
        archetypes: []
    },
    {
        label: "Blanks Its Own Text",
        description: "Treats its own printed text box as blank",
        aspects: ["self blank"],
        archetypes: []
    },
    {
        label: "Trait-Restricted",
        description: "Only works with, or counts, a specific trait",
        aspects: ["narrow"],
        archetypes: ["tribal"]
    },
    {
        label: "Needs a Specific Card",
        description: "Only works alongside a particular card or set of cards",
        aspects: ["narrow"],
        archetypes: ["combo"]
    },
    {
        label: "Needs a Wide Board",
        description: "Scales with, or needs, several characters in play",
        aspects: ["narrow"],
        archetypes: ["go wide"]
    }
];

function seedOption({ keywords = [], ...entry }: OptionSeed) {
    return { id: crypto.randomUUID(), ...entry, keywords, enabled: true };
}

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
            rewardOptions: REWARD_OPTIONS_SEED.map(seedOption),
            downsideOptions: DOWNSIDE_OPTIONS_SEED.map(seedOption)
        },
        created: now,
        createdBy: "system",
        updated: now,
        updatedBy: "system"
    });
    log.success("Seeded suggestions settings (minimumLikesThreshold, rewardOptions, downsideOptions)");
}

export const migration: Migration = {
    name: "014_suggestionsRework",
    description:
        "Reshapes suggestions for the suggestions rework: adds draft/questions/derived/checklistJustifications/" +
        "pivotPoints/comparableCards/combosWith, drops the old free-text tags field and threadId, converts " +
        "archivedReason (string) into a structured archived object, and moves likedBy/approvedBy/approvedAt " +
        "under _metadata.engagement as Like/Dislike/Ignore reactions (normalizing any bare-discordId-array " +
        "likedBy entries along the way); also seeds a settings document for suggestions (minimumLikesThreshold, " +
        "rewardOptions, downsideOptions), replacing the old static reward/punishment type registries, " +
        "and reintroduces `tags` as the (empty, since questions.rewards/downsides are also reset here) " +
        "server-computed union of the newly-empty selection's reward/downside tags",

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
                    rewards: [],
                    downsides: [],
                    iconic: false,
                    intendedGameModes: []
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
