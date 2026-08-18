import BaseJoi from "joi";
import * as Cards from "./cards";
import * as Projects from "./projects";
import * as Slots from "./slots";
import * as Artwork from "./artwork";
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
        _metadata: Joi.object({
            discord: DiscordMetadata
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
        _metadata: Joi.object({
            discord: DiscordMetadata
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
        _metadata: Joi.forbidden(),
        created: Joi.date(),
        createdBy: Joi.string(),
        updated: Joi.date(),
        updatedBy: Joi.string()
    })
};

// Artwork and artists are addressed by link rather than stored, so a half-typed one is the whole failure
const Link = Joi.string()
    .uri({ scheme: ["http", "https"] })
    .messages({
        "string.uri": "Enter a full link, starting with http:// or https://",
        "string.uriCustomScheme": "Enter a full link, starting with http:// or https://"
    });

// ISO 13616: 2-letter country code, 2 check digits, then up to 30 alphanumeric BBAN characters (15-34 total)
const IBAN_FORMAT = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

// ISO 9362: 4-letter bank code, 2-letter country code, 2-character location code, optional 3-character branch code
const SWIFT_BIC_FORMAT = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

// Digit-by-digit remainder, so the numeric string (which can run past 30 characters) never has to be
// parsed as a single number
function mod97(numeric: string): number {
    return numeric.split("").reduce((remainder, digit) => (remainder * 10 + Number(digit)) % 97, 0);
}

// ISO 7064 MOD 97-10 checksum: move the country code and check digits to the end, letters become A=10..Z=35,
// and the result must be 1 - catches typos a format check alone lets through
function isValidIbanChecksum(iban: string): boolean {
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    const numeric = rearranged
        .split("")
        .map((char) => (/[A-Z]/.test(char) ? (char.charCodeAt(0) - 55).toString() : char))
        .join("");
    return mod97(numeric) === 1;
}

// Required with a friendly message while its type is selected, left optional otherwise - same reasoning
// as sourcedOption's isInUse split. `base` carries any extra rules a field needs beyond "required"
function requiredWhen(type: Artwork.PaymentType, message: string, base: BaseJoi.StringSchema = Joi.string().trim()) {
    return Joi.when("type", {
        is: type,
        then: base.required().messages({ "any.required": message, "string.empty": message }),
        otherwise: Joi.string().trim().allow("")
    });
}

const artistPayment = Joi.object({
    type: Joi.string()
        .required()
        .valid(...Artwork.paymentTypes),
    revtag: requiredWhen("revolut", "Provide their Revtag"),
    email: requiredWhen("paypal", "Provide their PayPal email"),
    accountName: requiredWhen("bankTransfer", "Provide the account name"),
    iban: requiredWhen(
        "bankTransfer",
        "Provide the IBAN",
        Joi.string()
            .trim()
            .uppercase()
            .replace(/\s+/g, "")
            .pattern(IBAN_FORMAT)
            .custom((value, helpers) => (isValidIbanChecksum(value) ? value : helpers.error("any.invalid")))
            .messages({ "string.pattern.base": "Enter a valid IBAN", "any.invalid": "Enter a valid IBAN" })
    ),
    swiftBic: requiredWhen(
        "bankTransfer",
        "Provide the SWIFT/BIC",
        Joi.string()
            .trim()
            .uppercase()
            .replace(/\s+/g, "")
            .pattern(SWIFT_BIC_FORMAT)
            .messages({ "string.pattern.base": "Enter a valid SWIFT/BIC code" })
    )
});

export const Artist = {
    Full: Joi.object({
        id: Joi.string().required(),
        name: Joi.string().required(),
        contact: Joi.string().allow(""),
        portfolio: Joi.string().uri().allow(""),
        blanketPermission: Joi.boolean(),
        payment: artistPayment,
        notes: Joi.string().allow(""),
        created: Joi.date().required(),
        createdBy: Joi.string().required(),
        updated: Joi.date().required(),
        updatedBy: Joi.string().required()
    }),
    // Body for create/edit - id and the audit fields are server-managed
    Draft: Joi.object({
        id: Joi.forbidden(),
        name: Joi.string().trim().required().messages({
            "any.required": "Provide the artist's name",
            "string.empty": "Provide the artist's name"
        }),
        contact: Joi.string().trim().allow(""),
        portfolio: Link.allow(""),
        blanketPermission: Joi.boolean(),
        payment: artistPayment,
        notes: Joi.string().trim().allow(""),
        created: Joi.forbidden(),
        createdBy: Joi.forbidden(),
        updated: Joi.forbidden(),
        updatedBy: Joi.forbidden()
    })
};

// In use, an option is being put forward and must name both a piece and an artist; held, it answers for nothing
const sourcedOption = (isInUse: boolean) =>
    Joi.object({
        id: Joi.string().required(),
        url: isInUse
            ? Link.required().messages({
                  "any.required": "Add a link to this option's image",
                  "string.empty": "Add a link to this option's image"
              })
            : Link.allow("").required(),
        artist: isInUse
            ? Joi.string().required().messages({
                  "any.required": "Choose the artist behind this option",
                  "string.empty": "Choose the artist behind this option"
              })
            : Joi.string().allow(""),
        ffg: Joi.boolean(),
        // Restates Artwork.canImplyPermission's rule rather than calling it: .custom() chained after
        // .valid() is silently never invoked in Joi 17.13.3, so routing through it would disable the check
        contact: Joi.string()
            .required()
            .valid(...Artwork.artworkContactStates)
            .when("ffg", {
                is: Joi.not(true),
                then: Joi.invalid("implied").messages({
                    "any.invalid": "Implied permission requires FFG artwork to be checked"
                })
            }),
        notes: Joi.string().allow("")
    });

const sourcedArtwork = (isInUse: boolean) =>
    Joi.object({
        options: Joi.array().required().items(sourcedOption(isInUse)),
        selectedId: Joi.string()
    });

// The per-type blocks are the same whether a slot is being read whole or patched, so only status/type differ
const ArtworkDetails = {
    // Only the type actually in use is validated strictly, so an unused block never holds up an unrelated save
    sourced: Joi.when("type", { is: "sourced", then: sourcedArtwork(true), otherwise: sourcedArtwork(false) }),
    commissioned: Joi.object({
        artist: Joi.string(),
        estimatedCompletion: Joi.date(),
        paidBy: Joi.string().allow(""),
        cost: Joi.object({
            amount: Joi.number().min(0).required(),
            currency: Joi.string().required()
        }),
        url: Link.allow(""),
        paid: Joi.boolean(),
        notes: Joi.string().allow("")
    }),
    ai: Joi.object({
        generatedBy: Joi.string(),
        resource: Joi.string().allow(""),
        url: Link.allow(""),
        notes: Joi.string().allow("")
    }),
    prep: Joi.array().items(
        Joi.object({
            flag: Joi.string()
                .required()
                .valid(...Artwork.artworkPrepFlags),
            done: Joi.boolean().required()
        })
    )
};

// The whole artwork block. Exported as Slot.ArtworkProgress so the tab validates its draft against the
// same object PATCH does, rather than against a hand-written mirror of it
const ArtworkProgress = Joi.object({
    status: Joi.string().valid(...Slots.artworkStatuses),
    type: Joi.string().valid(...Slots.artworkTypes),
    // allow("") rather than optional - the PATCH merge only touches keys present in the body, and JSON drops undefined
    assignee: Joi.string().allow(""),
    ...ArtworkDetails
});

export const Slot = {
    // Shared with the client's artwork form, so the tab and PATCH refuse the same things
    ArtworkProgress,
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
                            note: Joi.string().max(Slots.RELEASE_CHECK_NOTE_MAX).allow(""),
                            version: Joi.string().required().regex(Regex.SemanticVersion),
                            _metadata: Joi.object({
                                discord: DiscordMetadata
                            }),
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
            artwork: ArtworkProgress.fork("status", (status) => status.required()).required(),
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
                        note: Joi.string().max(Slots.RELEASE_CHECK_NOTE_MAX).allow(""),
                        version: Joi.string().regex(Regex.SemanticVersion),
                        _metadata: Joi.object({
                            discord: DiscordMetadata
                        }),
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
            artwork: ArtworkProgress,
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
            then: Joi.string().trim().max(Slots.RELEASE_CHECK_NOTE_MAX).required().messages({
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
