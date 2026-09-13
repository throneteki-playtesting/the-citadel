export interface PunishmentTypeDefinition {
    id: string;
    label: string;
    description: string;
    examples: string[];
    /** hidden synonyms/alt-phrasing the search box also matches against - never rendered */
    tags: string[];
}

export const PUNISHMENT_TYPES: PunishmentTypeDefinition[] = [
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

export type PunishmentType = (typeof PUNISHMENT_TYPES)[number]["id"];
