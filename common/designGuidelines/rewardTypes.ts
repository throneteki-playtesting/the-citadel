export interface RewardTypeDefinition {
    id: string;
    label: string;
    description: string;
    /** short, real-card-sourced illustrative strings - not gameplay-verified rules text */
    examples: string[];
    /** for UI grouping - a reward type can belong to more than one */
    categories: string[];
    /** hidden synonyms/alt-phrasing the search box also matches against - never rendered */
    tags: string[];
}

export const REWARD_TYPES: RewardTypeDefinition[] = [
    // Economic
    {
        id: "gainsGold",
        label: "Gains Gold",
        description: "Adds gold to a player's pool",
        examples: ['Antler Men: "gain 1 gold"'],
        categories: ["economic"],
        tags: ["gold", "economy", "income"]
    },
    {
        id: "drawsCards",
        label: "Draws Cards",
        description: "Draws cards from a deck",
        examples: ['Jon Arryn: "draw 2 cards"'],
        categories: ["economic"],
        tags: ["draw", "cards", "card advantage"]
    },
    {
        id: "modifyIncome",
        label: "Modifies Income",
        description: "Changes a plot's income value",
        examples: ['Lannisport: "+1 Income"'],
        categories: ["economic"],
        tags: ["gold", "income", "plot"]
    },
    {
        id: "modifyInitiative",
        label: "Modifies Initiative",
        description: "Changes a plot's initiative value",
        examples: ['The Wolfswood: "+1 Initiative"'],
        categories: ["economic"],
        tags: ["initiative", "plot"]
    },
    {
        id: "modifyClaim",
        label: "Modifies Claim",
        description: "Changes a plot's claim value, or swaps which claim type applies",
        examples: ['Trial by Combat: "apply military claim instead"'],
        categories: ["economic"],
        tags: ["claim", "plot"]
    },
    {
        id: "modifyReserve",
        label: "Modifies Reserve",
        description: "Changes a plot's reserve value",
        examples: ['Stony Shore Thrall: "reduce the reserve value...by 1"'],
        categories: ["economic"],
        tags: ["reserve", "plot"]
    },
    {
        id: "reducesCosts",
        label: "Reduces Costs",
        description: "Lowers what a player pays to marshal/play a card",
        examples: ['Squire: "reduce the cost of the next Army...by 1"'],
        categories: ["economic"],
        tags: ["discount", "cost reduction"]
    },
    {
        id: "goldOnCards",
        label: "Gold-on-Card Tokens",
        description: "Places or removes gold tokens on a card (its own sub-economy, distinct from the gold pool)",
        examples: ['Ashemark Councilor: "each of those cards gains 1 gold"'],
        categories: ["economic"],
        tags: ["gold token", "economy"]
    },

    // Board & stat impact
    {
        id: "statModification",
        label: "Stat Modification",
        description: "Changes a character's STR or a card's printed cost",
        examples: ['Grey Worm\'s Spear: "each defending character gets -1 STR"'],
        categories: ["board"],
        tags: ["buff", "debuff", "str", "strength"]
    },
    {
        id: "iconManipulation",
        label: "Icon Manipulation",
        description: "Adds or removes challenge icons",
        examples: ['The Blackfish: "gains an intrigue icon"'],
        categories: ["board"],
        tags: ["icon", "challenge icon"]
    },
    {
        id: "keywordGranting",
        label: "Keyword Granting/Removal",
        description: "Grants or strips a keyword",
        examples: ['Support of Saltcliffe: "gains stealth"'],
        categories: ["board"],
        tags: ["keyword", "grant", "strip keyword"]
    },
    {
        id: "traitOrFactionModification",
        label: "Trait/Faction Modification",
        description: "Grants/removes a trait, or changes faction affiliation",
        examples: ['The Wall: "gains the Night\'s Watch affiliation and loses all other faction affiliations"'],
        categories: ["board"],
        tags: ["trait", "faction", "affiliation"]
    },

    // Position & participation
    {
        id: "kneelOrStand",
        label: "Kneel or Stand",
        description: "Kneels or stands a card",
        examples: ['Lordsport Shipwright: "choose and kneel a location"'],
        categories: ["participation"],
        tags: ["kneel", "stand", "tap", "untap"]
    },
    {
        id: "challengeParticipation",
        label: "Challenge Participation",
        description: "Adds/removes a character from a challenge, or suppresses its STR contribution",
        examples: ['Mace Tyrell: "remove it from the challenge"'],
        categories: ["participation"],
        tags: ["challenge", "participation"]
    },
    {
        id: "extraChallengeOrAction",
        label: "Extra Challenge/Action",
        description: "Grants an additional challenge, marshal, or play opportunity",
        examples: ['A Storm of Swords: "initiate an additional military challenge"'],
        categories: ["participation"],
        tags: ["extra action", "additional challenge"]
    },

    // Removal, recursion & movement
    {
        id: "removalOrKill",
        label: "Removal or Kill",
        description: "Kills a character or discards a card from play",
        examples: ["Ser Willam Wells (kill effect)"],
        categories: ["removal"],
        tags: ["kill", "removal", "discard from play"]
    },
    {
        id: "returnToHand",
        label: "Return to Hand (Bounce)",
        description: "Returns a card to its owner's hand, without killing it",
        examples: ['The Father: "return each of those characters to its owner\'s hand"'],
        categories: ["removal"],
        tags: ["bounce", "return"]
    },
    {
        id: "recursion",
        label: "Recursion",
        description: "Returns a card from discard/dead pile into play or hand",
        examples: ['Burning Bright: "put an Army or Knight character into play from your discard pile"'],
        categories: ["removal"],
        tags: ["recur", "reanimate", "from discard"]
    },
    {
        id: "cheatIntoPlay",
        label: "Cheat Into Play",
        description: "Puts a card into play outside normal marshaling",
        examples: ['Hear Me Roar!: "put a Lannister character into play from your hand"'],
        categories: ["removal"],
        tags: ["cheat", "free play", "put into play"]
    },
    {
        id: "controlChange",
        label: "Control Change",
        description: "Changes who controls a card, without it leaving play",
        examples: ['Winterfell: "take control of that character"'],
        categories: ["removal"],
        tags: ["steal", "control", "take"]
    },
    {
        id: "zoneMovement",
        label: "Zone Movement",
        description: "Moves a card to/from a non-play zone (shadows, removed from game)",
        examples: ['Journey to Oldtown: "remove it from the game until the beginning of the next plot phase"'],
        categories: ["removal"],
        tags: ["shadows", "exile", "remove from game"]
    },
    {
        id: "attachmentManipulation",
        label: "Attachment Manipulation",
        description: "Attaches, moves, or detaches an attachment",
        examples: ['Arya\'s Gift: "move an attachment...to another eligible character"'],
        categories: ["removal"],
        tags: ["attachment", "move attachment"]
    },

    // Deck & hand interaction
    {
        id: "searchOrTutor",
        label: "Search or Tutor",
        description: "Searches the deck for a specific card",
        examples: ['Muster: "search your deck for a Knight character"'],
        categories: ["cardAdvantage"],
        tags: ["search", "tutor", "deck search"]
    },
    {
        id: "deckManipulation",
        label: "Deck Manipulation",
        description: "Looks at, reorders, or mills cards from a deck",
        examples: ['Doran Martell: "look at the top 2 cards of your deck"'],
        categories: ["cardAdvantage"],
        tags: ["deck", "mill", "reorder", "scry"]
    },
    {
        id: "handDisruption",
        label: "Hand Disruption",
        description: "Forces discard from, or reveals, an opponent's hand",
        examples: ['Heads on Spikes: "discard 1 card at random from that player\'s hand"'],
        categories: ["cardAdvantage"],
        tags: ["discard", "hand attack"]
    },

    // Defense & restriction
    {
        id: "protection",
        label: "Protection",
        description: "Standing immunity from being killed/targeted",
        examples: ["Valyrian Steel Armor"],
        categories: ["defensive"],
        tags: ["immune", "cannot be killed"]
    },
    {
        id: "saveEffect",
        label: "Save Effect",
        description: "Reactively rescues a card that would be killed/discarded",
        examples: ['Ghost: "sacrifice Ghost to save him"'],
        categories: ["defensive"],
        tags: ["save", "rescue", "prevent death"]
    },
    {
        id: "denialOrRestriction",
        label: "Denial/Restriction",
        description: "Forbids a player from taking an action",
        examples: ['Marching Orders: "you cannot marshal locations or attachments"'],
        categories: ["defensive"],
        tags: ["restrict", "deny", "lockdown"]
    },
    {
        id: "cancelOrNegate",
        label: "Cancel/Negate",
        description: "Cancels a triggered ability or event before it resolves",
        examples: ['The Hand\'s Judgment: "cancel those effects"'],
        categories: ["defensive"],
        tags: ["cancel", "counter", "negate"]
    },
    {
        id: "abilityBlanking",
        label: "Ability Blanking",
        description: "Treats a card's printed text as blank",
        examples: ['Fortified Position: "treat each character as if its printed text box were blank"'],
        categories: ["defensive"],
        tags: ["blank", "silence", "text removal"]
    },

    // Other
    {
        id: "powerManipulation",
        label: "Power Manipulation",
        description: "Adds, removes, or moves power",
        examples: ['Tyene Sand: "move 1 power from the winning opponent\'s faction card to a character you control"'],
        categories: ["board"],
        tags: ["power", "move power"]
    }
];

export type RewardType = (typeof REWARD_TYPES)[number]["id"];
