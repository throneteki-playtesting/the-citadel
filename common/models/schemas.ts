import BaseJoi from "joi";
import * as Cards from "./cards";
import * as Projects from "./projects";
import * as Slots from "./slots";
import { statementAnswers } from "./reviews";
import { Regex } from "../utils";
import PermissionEnum from "./permissions";
import { logCategories, logSeverities } from "./logs";

// Collect all validation errors instead of stopping at the first - callers rely on seeing the full set.
// `errors.label: false` deliberately isn't baked in here too; see server/src/celebrate.ts for why.
const Joi = BaseJoi.defaults((schema) => schema.options({ abortEarly: false }));

const DiscordMetadata = Joi.object({
    messageUrl: Joi.string().uri(),
    lastSynced: Joi.date()
});

const GithubIssueMetadata = Joi.object({
    status: Joi.string().valid(...Cards.githubStatuses),
    issueUrl: Joi.string().uri(),
    closedAt: Joi.date(),
    lastSynced: Joi.date()
});

const GithubPRMetadata = Joi.object({
    status: Joi.string().valid(...Projects.githubStatuses),
    mergedAt: Joi.date(),
    pullRequestUrl: Joi.string().uri(),
    lastSynced: Joi.date()
});

const JoiXNumber = Joi.alternatives().try(Joi.number(), Joi.string().valid("X"));
const JoiXDashNumber = Joi.alternatives().try(Joi.number(), Joi.string().valid("X", "-"));

const Permission = Joi.string().valid(...Object.values(PermissionEnum));

export type SchemaType = BaseJoi.ObjectSchema<unknown>;

export const SingleOrArray = (object: BaseJoi.ObjectSchema) =>
    Joi.alternatives().try(object, Joi.array().items(object));

export const Card = {
    Full: Joi.object({
        code: Joi.string().regex(Regex.Card.code),
        faction: Joi.string()
            .required()
            .valid(...Cards.factions),
        name: Joi.string().required(),
        type: Joi.string()
            .required()
            .valid(...Cards.types),
        loyal: Joi.when("faction", {
            is: Joi.not("neutral"),
            then: Joi.boolean().required()
        }),
        traits: Joi.array().items(Joi.string()),
        text: Joi.string(),
        illustrator: Joi.string(),
        flavor: Joi.string(),
        designer: Joi.string(),
        deckLimit: Joi.number(),
        quantity: Joi.number(),
        cost: Joi.when("type", {
            is: Joi.valid("character", "location", "attachment", "event"),
            then: JoiXDashNumber.required()
        }),
        unique: Joi.when("type", {
            is: Joi.valid("character", "location", "attachment"),
            then: Joi.boolean().required()
        }),
        strength: Joi.when("type", {
            is: Joi.valid("character"),
            then: JoiXNumber.required()
        }),
        icons: Joi.when("type", {
            is: Joi.valid("character"),
            then: Joi.object({
                military: Joi.boolean().required(),
                intrigue: Joi.boolean().required(),
                power: Joi.boolean().required()
            }).required()
        }),
        plotStats: Joi.when("type", {
            is: Joi.valid("plot"),
            then: Joi.object({
                income: JoiXNumber.required(),
                initiative: JoiXNumber.required(),
                claim: JoiXNumber.required(),
                reserve: JoiXNumber.required()
            }).required()
        })
    }),
    Partial: Joi.object({
        code: Joi.string().regex(Regex.Card.code),
        faction: Joi.string().valid(...Cards.factions),
        name: Joi.string(),
        type: Joi.string().valid(...Cards.types),
        loyal: Joi.boolean(),
        traits: Joi.array().items(Joi.string()),
        text: Joi.string(),
        illustrator: Joi.string(),
        flavor: Joi.string(),
        designer: Joi.string(),
        deckLimit: Joi.number(),
        quantity: Joi.number(),
        cost: JoiXDashNumber,
        unique: Joi.boolean(),
        strength: JoiXNumber,
        icons: Joi.object({
            military: Joi.boolean(),
            intrigue: Joi.boolean(),
            power: Joi.boolean()
        }),
        plotStats: Joi.object({
            income: JoiXNumber,
            initiative: JoiXNumber,
            claim: JoiXNumber,
            reserve: JoiXNumber
        })
    })
};

export const PlaytestingCard = {
    Full: Card.Full.keys({
        project: Joi.number().required(),
        number: Joi.number().required(),
        version: Joi.string().required().regex(Regex.SemanticVersion),
        latest: Joi.boolean(),
        draft: Joi.boolean(),
        note: Joi.object({
            type: Joi.string()
                .required()
                .valid(...Cards.noteTypes),
            text: Joi.string().when("type", {
                is: Joi.not("implemented"),
                then: Joi.required()
            })
        }),
        playtesting: Joi.string().regex(Regex.SemanticVersion),
        implemented: Joi.boolean().required(),
        suggestionId: Joi.string(),
        released: Joi.object({
            code: Joi.string().required(),
            number: Joi.number().required()
        }),
        _metadata: Joi.object({
            github: GithubIssueMetadata,
            discord: DiscordMetadata,
            imageUrl: Joi.string().uri()
        }),
        updated: Joi.date(),
        updatedBy: Joi.string(),
        created: Joi.date(),
        createdBy: Joi.string()
    }),
    Partial: Card.Partial.keys({
        project: Joi.number(),
        number: Joi.number(),
        version: Joi.string().regex(Regex.SemanticVersion),
        latest: Joi.boolean(),
        draft: Joi.boolean(),
        note: Joi.object({
            type: Joi.string().valid(...Cards.noteTypes),
            text: Joi.string()
        }),
        playtesting: Joi.string().regex(Regex.SemanticVersion),
        implemented: Joi.boolean(),
        suggestionId: Joi.string(),
        released: Joi.object({
            code: Joi.string().required(),
            number: Joi.number().required()
        }),
        _metadata: Joi.object({
            github: GithubIssueMetadata,
            discord: DiscordMetadata,
            imageUrl: Joi.string().uri()
        }),
        updated: Joi.date(),
        updatedBy: Joi.string(),
        created: Joi.date(),
        createdBy: Joi.string()
    }),
    Draft: Card.Full.keys({
        project: Joi.number().required(),
        number: Joi.number().required(),
        version: Joi.string().regex(Regex.SemanticVersion),
        latest: Joi.boolean(),
        draft: Joi.boolean(),
        note: Joi.object({
            type: Joi.string()
                .required()
                .valid(...Cards.noteTypes),
            text: Joi.string().when("type", {
                is: Joi.not("implemented"),
                then: Joi.required()
            })
        }).when("version", { not: Joi.string().pattern(/^0\.0\.\d+$/), then: Joi.required() }),
        playtesting: Joi.string().regex(Regex.SemanticVersion),
        implemented: Joi.boolean(),
        suggestionId: Joi.string(),
        released: Joi.forbidden(),
        _metadata: Joi.object({
            github: GithubIssueMetadata,
            discord: DiscordMetadata,
            imageUrl: Joi.string().uri()
        }),
        updated: Joi.date(),
        updatedBy: Joi.string(),
        created: Joi.date(),
        createdBy: Joi.string()
    })
};

export const RenderedCard = {
    Full: Card.Full.keys({
        code: Joi.forbidden(), // Code not required (from card schema)
        key: Joi.string().required(),
        watermark: Joi.object({
            top: Joi.string(),
            middle: Joi.string(),
            bottom: Joi.string()
        })
    }),
    Partial: Card.Partial.keys({
        code: Joi.forbidden(), // Code not required (from card schema)
        key: Joi.string(),
        watermark: Joi.object({
            top: Joi.string(),
            middle: Joi.string(),
            bottom: Joi.string()
        })
    })
};

export const CardSuggestion = {
    Full: Joi.object({
        id: Joi.string(),
        user: Joi.object({
            discordId: Joi.string().required(),
            displayname: Joi.string().required()
        }).required(),
        created: Joi.date().required(),
        createdBy: Joi.string().required(),
        updated: Joi.date().required(),
        updatedBy: Joi.string().required(),
        threadId: Joi.string(),
        likedBy: Joi.array().items(Joi.string()).default([]),
        approvedBy: Joi.string(),
        tags: Joi.array().items(Joi.string()).default([]),
        _metadata: Joi.object({
            discord: DiscordMetadata
        }),
        card: Card.Full.required()
    }),
    Partial: Joi.object({
        id: Joi.string(),
        user: Joi.object({
            discordId: Joi.string(),
            displayname: Joi.string()
        }),
        created: Joi.date(),
        createdBy: Joi.string(),
        updated: Joi.date(),
        updatedBy: Joi.string(),
        threadId: Joi.string(),
        likedBy: Joi.array().items(Joi.string()),
        approvedBy: Joi.string(),
        tags: Joi.array().items(Joi.string()),
        _metadata: Joi.object({
            discord: DiscordMetadata
        }),
        card: Card.Partial
    }),
    Draft: Joi.object({
        id: Joi.string(),
        user: Joi.object({
            discordId: Joi.string(),
            displayname: Joi.string()
        }).required(),
        created: Joi.date(),
        createdBy: Joi.string(),
        updated: Joi.date(),
        updatedBy: Joi.string(),
        threadId: Joi.string(),
        likedBy: Joi.array().items(Joi.string()).default([]),
        approvedBy: Joi.string(),
        tags: Joi.array().items(Joi.string()).default([]),
        _metadata: Joi.object({
            discord: DiscordMetadata
        }),
        card: Card.Full.required()
    })
};

const ReleaseSlots = Joi.array().items(
    Joi.object({
        faction: Joi.string()
            .required()
            .valid(...Cards.factions),
        count: Joi.number().integer().min(0).required()
    })
);

export const Release = {
    Full: Joi.object({
        code: Joi.string().required(),
        name: Joi.string().required(),
        number: Joi.number().required(),
        capacity: Joi.number().required(),
        slots: ReleaseSlots.required(),
        plannedDate: Joi.string().regex(Regex.ReleaseDate),
        releasedDate: Joi.string().regex(Regex.ReleaseDate),
        status: Joi.string()
            .required()
            .valid(...Projects.releaseStatuses),
        article: Joi.object({
            url: Joi.string().uri(),
            status: Joi.string().valid(...Projects.articleStatuses)
        }),
        created: Joi.date().required(),
        createdBy: Joi.string().required(),
        updated: Joi.date().required(),
        updatedBy: Joi.string().required()
    }),
    Partial: Joi.object({
        code: Joi.string(),
        name: Joi.string(),
        number: Joi.number(),
        capacity: Joi.number(),
        slots: ReleaseSlots,
        plannedDate: Joi.string().regex(Regex.ReleaseDate),
        releasedDate: Joi.string().regex(Regex.ReleaseDate),
        status: Joi.string().valid(...Projects.releaseStatuses),
        article: Joi.object({
            url: Joi.string().uri(),
            status: Joi.string().valid(...Projects.articleStatuses)
        }),
        created: Joi.date(),
        createdBy: Joi.string(),
        updated: Joi.date(),
        updatedBy: Joi.string()
    }),
    // Used for create/edit bodies - number, capacity & releasedDate are server-managed (number via sequence assignment/reorder, capacity derived from slots, the rest via the publish action)
    Draft: Joi.object({
        code: Joi.string().required(),
        name: Joi.string().required(),
        number: Joi.forbidden(),
        capacity: Joi.forbidden(),
        slots: ReleaseSlots.min(1).required(),
        plannedDate: Joi.string().regex(Regex.ReleaseDate),
        releasedDate: Joi.forbidden(),
        status: Joi.string().valid(...Projects.releaseStatuses),
        article: Joi.object({
            url: Joi.string().uri(),
            status: Joi.string().valid(...Projects.articleStatuses)
        }),
        created: Joi.date(),
        createdBy: Joi.string(),
        updated: Joi.date(),
        updatedBy: Joi.string()
    })
};

export const Slot = {
    Full: Joi.object({
        project: Joi.number().required(),
        number: Joi.number().required(),
        faction: Joi.string()
            .required()
            .valid(...Cards.factions),
        type: Joi.string().valid(...Cards.types),
        notes: Joi.string().allow(""),
        statuses: Joi.object({
            design: Joi.object({
                status: Joi.string()
                    .required()
                    .valid(...Slots.designStatuses),
                checks: Joi.array()
                    .required()
                    .items(
                        Joi.object({
                            ready: Joi.boolean().required(),
                            categories: Joi.array().items(Joi.string().valid(...Slots.releaseCheckCategories)),
                            note: Joi.string().max(140).allow(""),
                            version: Joi.string().required().regex(Regex.SemanticVersion),
                            created: Joi.date().required(),
                            createdBy: Joi.string().required(),
                            updated: Joi.date().required(),
                            updatedBy: Joi.string().required()
                        })
                    ),
                finalApproval: Joi.object({
                    by: Joi.string().required(),
                    at: Joi.date().required()
                })
            }).required(),
            artwork: Joi.object({
                status: Joi.string()
                    .required()
                    .valid(...Slots.artworkStatuses),
                type: Joi.string().valid(...Slots.artworkTypes)
            }).required(),
            production: Joi.string()
                .required()
                .valid(...Slots.productionStatuses)
        }).required(),
        release: Joi.object({
            code: Joi.string().required(),
            position: Joi.number().required(),
            released: Joi.boolean()
        }),
        created: Joi.date().required(),
        createdBy: Joi.string().required(),
        updated: Joi.date().required(),
        updatedBy: Joi.string().required()
    }),
    Partial: Joi.object({
        project: Joi.number(),
        number: Joi.number(),
        faction: Joi.string().valid(...Cards.factions),
        type: Joi.string().valid(...Cards.types),
        notes: Joi.string().allow(""),
        statuses: Joi.object({
            design: Joi.object({
                status: Joi.string().valid(...Slots.designStatuses),
                checks: Joi.array().items(
                    Joi.object({
                        ready: Joi.boolean().required(),
                        categories: Joi.array().items(Joi.string().valid(...Slots.releaseCheckCategories)),
                        note: Joi.string().max(140).allow(""),
                        version: Joi.string().regex(Regex.SemanticVersion),
                        created: Joi.date(),
                        createdBy: Joi.string(),
                        updated: Joi.date(),
                        updatedBy: Joi.string()
                    })
                ),
                finalApproval: Joi.object({
                    by: Joi.string().required(),
                    at: Joi.date().required()
                }).allow(null)
            }),
            artwork: Joi.object({
                status: Joi.string().valid(...Slots.artworkStatuses),
                type: Joi.string().valid(...Slots.artworkTypes)
            }),
            production: Joi.string().valid(...Slots.productionStatuses)
        }),
        release: Joi.object({
            code: Joi.string().required(),
            position: Joi.number().required(),
            released: Joi.boolean()
        }).allow(null),
        created: Joi.date(),
        createdBy: Joi.string(),
        updated: Joi.date(),
        updatedBy: Joi.string()
    }),
    // Body for PATCH /:slot/design/checks - shared with the client's release-check form validation
    ReleaseCheck: Joi.object({
        ready: Joi.boolean().required(),
        categories: Joi.when("ready", {
            is: false,
            then: Joi.array()
                .required()
                .min(1)
                .items(Joi.string().valid(...Slots.releaseCheckCategories))
                .messages({
                    "any.required": "Select at least one category",
                    "array.min": "Select at least one category"
                }),
            otherwise: Joi.forbidden()
        }),
        note: Joi.when("ready", {
            is: false,
            then: Joi.string().trim().max(140).required().messages({
                "any.required": "Provide your reasoning",
                "string.empty": "Provide your reasoning"
            }),
            otherwise: Joi.forbidden()
        })
    })
};

export const Project = {
    Full: Joi.object({
        number: Joi.number().integer().max(99).required(),
        name: Joi.string().required(),
        code: Joi.string().required(),
        active: Joi.boolean().required(),
        draft: Joi.boolean().required(),
        description: Joi.string().allow(""),
        script: Joi.string(),
        type: Joi.string()
            .required()
            .valid(...Projects.types),
        cardCount: Joi.object({
            baratheon: Joi.number().required(),
            greyjoy: Joi.number().required(),
            lannister: Joi.number().required(),
            martell: Joi.number().required(),
            thenightswatch: Joi.number().required(),
            stark: Joi.number().required(),
            targaryen: Joi.number().required(),
            tyrell: Joi.number().required(),
            neutral: Joi.number().required()
        }).required(),
        version: Joi.number().required(),
        milestone: Joi.number(),
        mandateUrl: Joi.string(),
        formUrl: Joi.string(),
        emoji: Joi.string(),
        releases: Joi.array().items(Release.Full).required(),
        created: Joi.date().required(),
        createdBy: Joi.string().required(),
        updated: Joi.date().required(),
        updatedBy: Joi.string().required()
    }),
    Partial: Joi.object({
        number: Joi.number().integer().max(99),
        name: Joi.string(),
        code: Joi.string(),
        active: Joi.boolean(),
        draft: Joi.boolean(),
        description: Joi.string().allow(""),
        script: Joi.string(),
        type: Joi.string().valid(...Projects.types),
        cardCount: Joi.object({
            baratheon: Joi.number(),
            greyjoy: Joi.number(),
            lannister: Joi.number(),
            martell: Joi.number(),
            thenightswatch: Joi.number(),
            stark: Joi.number(),
            targaryen: Joi.number(),
            tyrell: Joi.number(),
            neutral: Joi.number()
        }),
        version: Joi.number(),
        milestone: Joi.number(),
        mandateUrl: Joi.string(),
        formUrl: Joi.string(),
        emoji: Joi.string(),
        releases: Joi.array().items(Release.Partial),
        created: Joi.date(),
        createdBy: Joi.string(),
        updated: Joi.date(),
        updatedBy: Joi.string()
    }),
    Draft: Joi.object({
        number: Joi.number().integer().max(99).required(),
        name: Joi.string().required(),
        code: Joi.string().required(),
        active: Joi.boolean().required(),
        draft: Joi.boolean().required(),
        description: Joi.string(),
        script: Joi.string(),
        type: Joi.string()
            .required()
            .valid(...Projects.types),
        cardCount: Joi.object({
            baratheon: Joi.number(),
            greyjoy: Joi.number(),
            lannister: Joi.number(),
            martell: Joi.number(),
            thenightswatch: Joi.number(),
            stark: Joi.number(),
            targaryen: Joi.number(),
            tyrell: Joi.number(),
            neutral: Joi.number()
        }),
        releases: Joi.array().items(Release.Partial),
        version: Joi.number().required(),
        milestone: Joi.number(),
        mandateUrl: Joi.string(),
        formUrl: Joi.string(),
        emoji: Joi.string(),
        created: Joi.date(),
        createdBy: Joi.string(),
        updated: Joi.date(),
        updatedBy: Joi.string()
    })
};

export const PlaytestingUpdate = {
    Full: Joi.object({
        project: Joi.number().required(),
        version: Joi.number().required(),
        description: Joi.string(),
        cardChanges: Joi.object().pattern(Joi.number(), Joi.string().regex(Regex.SemanticVersion)).required(),
        pullRequest: Joi.string(),
        _metadata: Joi.object({
            github: GithubPRMetadata
        }),
        created: Joi.date().required(),
        createdBy: Joi.string().required(),
        updated: Joi.date().required(),
        updatedBy: Joi.string().required()
    }),
    Partial: Joi.object({
        project: Joi.number(),
        version: Joi.number(),
        description: Joi.string(),
        cardChanges: Joi.object().pattern(Joi.number(), Joi.string().regex(Regex.SemanticVersion)),
        pullRequest: Joi.string(),
        _metadata: Joi.object({
            github: GithubPRMetadata
        }),
        created: Joi.date(),
        createdBy: Joi.string(),
        updated: Joi.date(),
        updatedBy: Joi.string()
    }),
    Draft: Joi.object({
        project: Joi.number().required(),
        description: Joi.string(),
        cardChanges: Joi.object().pattern(Joi.number(), Joi.string().regex(Regex.SemanticVersion)).required(),
        _metadata: Joi.object({
            github: GithubPRMetadata
        }),
        created: Joi.date(),
        createdBy: Joi.string(),
        updated: Joi.date(),
        updatedBy: Joi.string()
    })
};

const ReviewDeckSchema = Joi.object({
    link: Joi.string().required(),
    shared: Joi.boolean().required()
});

export const PlaytestingReview = {
    Full: Joi.object({
        reviewer: Joi.string().required(),
        project: Joi.number().required(),
        number: Joi.number().required(),
        version: Joi.string().required().regex(Regex.SemanticVersion),
        played: Joi.number().required(),
        decks: Joi.array()
            .items(ReviewDeckSchema)
            .when("played", {
                is: Joi.number().greater(0),
                then: Joi.array().required().min(1),
                otherwise: Joi.array().optional()
            }),
        statements: Joi.object({
            boring: Joi.string()
                .required()
                .valid(...statementAnswers),
            competitive: Joi.string()
                .required()
                .valid(...statementAnswers),
            creative: Joi.string()
                .required()
                .valid(...statementAnswers),
            balanced: Joi.string()
                .required()
                .valid(...statementAnswers),
            releasable: Joi.string()
                .required()
                .valid(...statementAnswers)
        }).required(),
        additional: Joi.string(),
        _metadata: Joi.object({
            discord: DiscordMetadata
        }),
        created: Joi.date().required(),
        createdBy: Joi.string().required(),
        updated: Joi.date().required(),
        updatedBy: Joi.string().required()
    }),
    Partial: Joi.object({
        reviewer: Joi.string(),
        project: Joi.number(),
        number: Joi.number(),
        version: Joi.string().regex(Regex.SemanticVersion),
        decks: Joi.array().items(ReviewDeckSchema).min(1),
        played: Joi.number(),
        statements: Joi.object({
            boring: Joi.string().valid(...statementAnswers),
            competitive: Joi.string().valid(...statementAnswers),
            creative: Joi.string().valid(...statementAnswers),
            balanced: Joi.string().valid(...statementAnswers),
            releasable: Joi.string().valid(...statementAnswers)
        }),
        additional: Joi.string(),
        _metadata: Joi.object({
            discord: DiscordMetadata
        }),
        created: Joi.date(),
        createdBy: Joi.string(),
        updated: Joi.date(),
        updatedBy: Joi.string()
    }),
    Draft: Joi.object({
        reviewer: Joi.string().required(),
        project: Joi.number().required(),
        number: Joi.number().required(),
        version: Joi.string().required().regex(Regex.SemanticVersion),
        played: Joi.number().required(),
        decks: Joi.array()
            .items(ReviewDeckSchema)
            .when("played", {
                is: Joi.number().greater(0),
                then: Joi.array().required().min(1),
                otherwise: Joi.array().optional()
            }),
        statements: Joi.object({
            boring: Joi.string()
                .required()
                .valid(...statementAnswers),
            competitive: Joi.string()
                .required()
                .valid(...statementAnswers),
            creative: Joi.string()
                .required()
                .valid(...statementAnswers),
            balanced: Joi.string()
                .required()
                .valid(...statementAnswers),
            releasable: Joi.string()
                .required()
                .valid(...statementAnswers)
        }).required(),
        additional: Joi.string(),
        _metadata: Joi.object({
            discord: DiscordMetadata
        }),
        created: Joi.date(),
        createdBy: Joi.string(),
        updated: Joi.date(),
        updatedBy: Joi.string()
    })
};

export const Deck = {
    Add: Joi.object({
        link: Joi.string().required()
    })
};

export const Role = {
    Full: Joi.object({
        discordId: Joi.string().required(),
        active: Joi.boolean().required(),
        name: Joi.string().required(),
        color: Joi.number().required(),
        position: Joi.number().required(),
        hoist: Joi.boolean().required(),
        icon: Joi.string().allow(null).required(),
        unicodeEmoji: Joi.string().allow(null).required(),
        permissions: Joi.array().items(Permission).default([])
    }),
    Partial: Joi.object({
        discordId: Joi.string(),
        active: Joi.boolean(),
        name: Joi.string(),
        color: Joi.number(),
        position: Joi.number(),
        hoist: Joi.boolean(),
        icon: Joi.string().allow(null),
        unicodeEmoji: Joi.string().allow(null),
        permissions: Joi.array().items(Permission)
    })
};

export const User = {
    Full: Joi.object({
        username: Joi.string().required(),
        displayname: Joi.string().required(),
        discordId: Joi.string().required(),
        avatarUrl: Joi.string().required(),
        lastLogin: Joi.date(),
        // Principal Data
        id: Joi.string().required(),
        permissions: Joi.array().items(Permission).default([]),
        roles: Joi.array().items(Role.Full).default([])
    }),
    Partial: Joi.object({
        username: Joi.string(),
        displayname: Joi.string(),
        discordId: Joi.string(),
        avatarUrl: Joi.string(),
        lastLogin: Joi.date(),
        // Principal Data
        id: Joi.string(),
        permissions: Joi.array().items(Permission),
        roles: Joi.array().items(Role.Partial)
    })
};

export const Integration = {
    Full: Joi.object({
        id: Joi.string(),
        name: Joi.string().required(),
        enabled: Joi.boolean().default(true),
        lastUsedAt: Joi.date(),
        ownerIds: Joi.array().items(Joi.string()).default([]),
        permissions: Joi.array().items(Permission).default([])
    }),
    Partial: Joi.object({
        id: Joi.string(),
        name: Joi.string(),
        enabled: Joi.boolean(),
        lastUsedAt: Joi.date(),
        ownerIds: Joi.array().items(Joi.string()),
        permissions: Joi.array().items(Permission)
    })
};

export const Log = {
    Full: Joi.object({
        id: Joi.string().required(),
        category: Joi.string()
            .required()
            .valid(...logCategories),
        action: Joi.string().required(),
        principal: Joi.object({
            type: Joi.string().required().valid("user", "integration", "anonymous", "system"),
            id: Joi.string().required()
        }).required(),
        message: Joi.string().required(),
        context: Joi.object().pattern(Joi.string(), Joi.string()).default({}),
        details: Joi.object().unknown(true),
        severity: Joi.string()
            .required()
            .valid(...logSeverities),
        created: Joi.date().required()
    })
};
