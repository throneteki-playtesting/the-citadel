import Joi from "joi";
import * as Cards from "./cards";
import * as Projects from "./projects";
import { statementAnswers } from "./reviews";
import { Regex } from "../utils";
import { Permission as UserPermissions } from "./user";

const JoiXNumber = Joi.alternatives().try(
    Joi.number(),
    Joi.string().valid("X")
);
const JoiXDashNumber = Joi.alternatives().try(
    Joi.number(),
    Joi.string().valid("X", "-")
);

const Permission = Joi.string().valid(...Object.values(UserPermissions));

export type SchemaType = Joi.ObjectSchema<unknown>;

export const SingleOrArray = (object: Joi.ObjectSchema) => Joi.alternatives().try(object, Joi.array().items(object));

export const Card = {
    Full: Joi.object({
        code: Joi.string().regex(Regex.Card.code),
        faction: Joi.string().required().valid(...Cards.factions),
        name: Joi.string().required(),
        type: Joi.string().required().valid(...Cards.types),
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
        imageUrl: Joi.string(),
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
            type: Joi.string().required().valid(...Cards.noteTypes),
            text: Joi.string().when("type", {
                is: Joi.not("implemented"),
                then: Joi.required()
            })
        }),
        playtesting: Joi.string().regex(Regex.SemanticVersion),
        github: Joi.object({
            status: Joi.string().required().valid(...Cards.githubStatuses),
            issueUrl: Joi.string().required()
        }),
        implemented: Joi.boolean().required(),
        release: Joi.object({
            short: Joi.string().required(),
            number: Joi.number().required()
        }),
        suggestionId: Joi.string()
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
        github: Joi.object({
            status: Joi.string().valid(...Cards.githubStatuses),
            issueUrl: Joi.string()
        }),
        implemented: Joi.boolean(),
        release: Joi.object({
            short: Joi.string(),
            number: Joi.number()
        }),
        suggestionId: Joi.string()
    }),
    Draft: Card.Full.keys({
        project: Joi.number().required(),
        number: Joi.number().required(),
        version: Joi.string().regex(Regex.SemanticVersion),
        latest: Joi.boolean(),
        draft: Joi.boolean(),
        note: Joi.object({
            type: Joi.string().required().valid(...Cards.noteTypes),
            text: Joi.string().when("type", {
                is: Joi.not("implemented"),
                then: Joi.required()
            })
        }).when("version", { not: Joi.string().valid("0.0.0"), then: Joi.required() }),
        playtesting: Joi.string().regex(Regex.SemanticVersion),
        github: Joi.object({
            status: Joi.string().required().valid(...Cards.githubStatuses),
            issueUrl: Joi.string().required()
        }),
        implemented: Joi.boolean().required(),
        release: Joi.object({
            short: Joi.string().required(),
            number: Joi.number().required()
        }),
        suggestionId: Joi.string()
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
        _id: Joi.string(),
        user: Joi.object({
            discordId: Joi.string().required(),
            displayname: Joi.string().required()
        }).required(),
        created: Joi.date().required(),
        updated: Joi.date().required(),
        threadId: Joi.string(),
        likedBy: Joi.array().items(Joi.string()).default([]),
        approvedBy: Joi.string(),
        tags: Joi.array().items(Joi.string()).default([]),
        card: Card.Full.required()
    }),
    Partial: Joi.object({
        _id: Joi.string(),
        user: Joi.object({
            discordId: Joi.string(),
            displayname: Joi.string()
        }),
        created: Joi.date(),
        updated: Joi.date(),
        threadId: Joi.string(),
        likedBy: Joi.array().items(Joi.string()),
        approvedBy: Joi.string(),
        tags: Joi.array().items(Joi.string()),
        card: Card.Partial
    }),
    Draft: Joi.object({
        _id: Joi.string(),
        user: Joi.object({
            discordId: Joi.string(),
            displayname: Joi.string()
        }).required(),
        created: Joi.date(),
        updated: Joi.date(),
        threadId: Joi.string(),
        likedBy: Joi.array().items(Joi.string()).default([]),
        approvedBy: Joi.string(),
        tags: Joi.array().items(Joi.string()).default([]),
        card: Card.Full.required()
    })
};

export const Project = {
    Full: Joi.object({
        number: Joi.number().required(),
        name: Joi.string().required(),
        code: Joi.string().required(),
        active: Joi.boolean().required(),
        draft: Joi.boolean().required(),
        description: Joi.string().allow(""),
        script: Joi.string(),
        type: Joi.string().required().valid(...Projects.types),
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
        created: Joi.date().required(),
        updated: Joi.date().required()
    }),
    Partial: Joi.object({
        number: Joi.number(),
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
        created: Joi.date(),
        updated: Joi.date()
    }),
    Draft: Joi.object({
        number: Joi.number().required(),
        name: Joi.string().required(),
        code: Joi.string().required(),
        active: Joi.boolean().required(),
        draft: Joi.boolean().required(),
        description: Joi.string(),
        script: Joi.string(),
        type: Joi.string().required().valid(...Projects.types),
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
        emoji: Joi.string()
    })
};

export const PlaytestingReview = {
    Full: Joi.object({
        reviewer: Joi.string().required(),
        project: Joi.number().required(),
        number: Joi.number().required(),
        version: Joi.string().required().regex(Regex.SemanticVersion),
        decks: Joi.array().required().items(Joi.string()).min(1),
        played: Joi.number().required(),
        statements: Joi.object({
            boring: Joi.string().required().valid(...statementAnswers),
            competitive: Joi.string().required().valid(...statementAnswers),
            creative: Joi.string().required().valid(...statementAnswers),
            balanced: Joi.string().required().valid(...statementAnswers),
            releasable: Joi.string().required().valid(...statementAnswers)
        }).required(),
        additional: Joi.string(),
        created: Joi.date().required(),
        updated: Joi.date().required()
    }),
    Partial: Joi.object({
        reviewer: Joi.string(),
        project: Joi.number(),
        number: Joi.number(),
        version: Joi.string().regex(Regex.SemanticVersion),
        decks: Joi.array().items(Joi.string()).min(1),
        played: Joi.number(),
        statements: Joi.object({
            boring: Joi.string().valid(...statementAnswers),
            competitive: Joi.string().valid(...statementAnswers),
            creative: Joi.string().valid(...statementAnswers),
            balanced: Joi.string().valid(...statementAnswers),
            releasable: Joi.string().valid(...statementAnswers)
        }),
        additional: Joi.string(),
        created: Joi.date(),
        updated: Joi.date()
    }),
    Draft: Joi.object({
        reviewer: Joi.string().required(),
        project: Joi.number().required(),
        number: Joi.number().required(),
        version: Joi.string().required().regex(Regex.SemanticVersion),
        decks: Joi.array().required().items(Joi.string()).min(1),
        played: Joi.number().required(),
        statements: Joi.object({
            boring: Joi.string().required().valid(...statementAnswers),
            competitive: Joi.string().required().valid(...statementAnswers),
            creative: Joi.string().required().valid(...statementAnswers),
            balanced: Joi.string().required().valid(...statementAnswers),
            releasable: Joi.string().required().valid(...statementAnswers)
        }).required(),
        additional: Joi.string()
    })
};

export const Role = {
    Full: Joi.object({
        discordId: Joi.string().required(),
        name: Joi.string().required(),
        permissions: Joi.array().items(Permission).default([])
    }),
    Partial: Joi.object({
        discordId: Joi.string(),
        name: Joi.string(),
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
        permissions: Joi.array().items(Permission).default([]),
        roles: Joi.array().items(Role.Full).default([])
    }),
    Partial: Joi.object({
        username: Joi.string(),
        displayname: Joi.string(),
        discordId: Joi.string(),
        avatarUrl: Joi.string(),
        lastLogin: Joi.date(),
        permissions: Joi.array().items(Permission),
        roles: Joi.array().items(Role.Partial)
    })
};