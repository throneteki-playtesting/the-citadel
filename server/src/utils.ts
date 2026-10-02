import { ILabeledCard, IPlaytestCard, NoteType, factions, uniqueTypes } from "common/models/cards";
import { FactionCardCount, IProject, IProjectRelease } from "common/models/projects";
import { ISlot } from "common/models/slots";
import { getReleaseCapacity, THRONESDB_URL } from "common/utils";
import { IGetResponse, OAuthTokenResponse } from "./types";
import { IDecklist } from "common/models/decks";
import { camelCase, startCase, uniq } from "lodash-es";
import { StatusCodes } from "http-status-codes";
import { ApiErrorResponse } from "./errors";
import { dataService } from "./services";
import asyncHandler from "express-async-handler";
import { SingleOrArray } from "common/types";
import { UUID } from "common/models/shared";

export const NoteVersion: Record<NoteType, "major" | "minor" | "patch" | undefined> = {
    replaced: "major",
    reworked: "minor",
    updated: "patch",
    refinement: "patch"
};

// Nothing in a draft project is published anywhere until it is initialised
export async function withoutDraftProjectCards(cards: IPlaytestCard[]) {
    if (cards.length === 0) {
        return cards;
    }
    const projects = await dataService.projects.read(
        uniq(cards.map((card) => card.project)).map((number) => ({ number }))
    );
    const drafts = new Set(projects.filter((project) => project.draft).map((project) => project.number));
    return cards.filter((card) => !drafts.has(card.project));
}

export function assertSyncableProject(project: IProject) {
    if (project.draft) {
        throw new ApiErrorResponse(
            StatusCodes.NOT_ACCEPTABLE,
            "Draft Project",
            "Cards in a draft project are not synced until the project is initialised"
        );
    }
}

/**
 * Recalculates and persists IProject.cardCount from the actual slots collection.
 * cardCount is a read cache only - slots are the source of truth for per-faction counts.
 */
export async function syncProjectCardCount(projectNumber: number) {
    const slots = await dataService.slots.read({ project: projectNumber });
    const cardCount = factions.reduce((acc, faction) => {
        acc[faction] = slots.filter((slot) => slot.faction === faction).length;
        return acc;
    }, {} as FactionCardCount);

    const [project] = await dataService.projects.read({ number: projectNumber });
    return dataService.projects.update({ ...project, cardCount });
}

/**
 * Builds the single fixed release for an expansion project, with every slot assigned a position -
 * faction blocks follow the canonical faction order, and slots are ordered by number within each.
 */
export function buildExpansionRelease(
    project: IProject,
    slots: ISlot[],
    principalId: string
): { release: IProjectRelease; assignedSlots: ISlot[] } {
    const allocations = factions
        .map((faction) => ({ faction, count: slots.filter((slot) => slot.faction === faction).length }))
        .filter((allocation) => allocation.count > 0);

    const now = new Date();
    const release: IProjectRelease = {
        code: project.code,
        name: project.name,
        number: 1,
        capacity: getReleaseCapacity(allocations),
        slots: allocations,
        status: "planning",
        created: now,
        createdBy: principalId,
        updated: now,
        updatedBy: principalId
    };

    let position = 1;
    const assignedSlots: ISlot[] = [];
    for (const { faction } of allocations) {
        const factionSlots = slots.filter((slot) => slot.faction === faction).sort((a, b) => a.number - b.number);
        for (const slot of factionSlots) {
            assignedSlots.push({ ...slot, release: { code: release.code, position: position++ } });
        }
    }

    return { release, assignedSlots };
}

/** Evicts a slot back to the development pool by removing its release placement */
export function clearRelease(slot: ISlot): ISlot {
    const cleared = { ...slot };
    delete cleared.release;
    return cleared;
}

export function generateGetResponse<T>(items: T[], total?: number): IGetResponse<T> {
    return {
        items,
        total: total ?? items.length
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertTDBDeck(obj: any): IDecklist {
    // Converts ThronesDB deck format to our own type
    return {
        id: obj.id,
        uuid: obj.uuid,
        name: obj.name,
        created: obj.date_creation,
        updated: obj.date_update,
        description: obj.description_md,
        userId: obj.user_id,
        faction: obj.faction_code,
        slots: obj.slots,
        agendas: obj.agendas,
        version: obj.version,
        tags: obj.tags
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertTDBCard(obj: any): ILabeledCard {
    return {
        code: obj.code,
        ...(obj.cost && { cost: obj.cost }),
        deckLimit: obj.deck_limit,
        ...(obj.designer && { designer: obj.designer }),
        faction: obj.faction_code,
        ...(obj.flavor && { flavor: obj.flavor }),
        ...(obj.type_code === "character" && {
            icons: { military: obj.is_military, intrigue: obj.is_intrigue, power: obj.is_power }
        }),
        illustrator: obj.illustrator,
        ...(obj.faction_code !== "neutral" && obj.type_code !== "agenda" && { loyal: obj.is_loyal }),
        name: obj.name,
        ...(obj.type_code === "plot" && {
            plotStats: { income: obj.income, initiative: obj.initiative, claim: obj.claim, reserve: obj.reserve }
        }),
        traits: obj.traits
            .split(".")
            .map((trait: string) => trait.trim().replace(/\.$/, ""))
            .filter((trait: string) => !!trait),
        text: obj.text,
        type: obj.type_code,
        ...(uniqueTypes.includes(obj.type_code) && { unique: obj.is_unique }),
        quantity: obj.quantity,
        imageUrl: obj.image_url,
        workInProgress: obj.work_in_progress,
        label: obj.label
    };
}

const THRONESDB_TOKEN_REDIS_KEY = "thronesdb_access_token";

async function getThronesDBToken() {
    const token = await dataService.redis.get(THRONESDB_TOKEN_REDIS_KEY);
    if (token && typeof token === "string") {
        return token;
    }

    const response = await fetch(`${THRONESDB_URL}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: process.env.THRONESDB_CLIENT_ID,
            client_secret: process.env.THRONESDB_CLIENT_SECRET,
            grant_type: "client_credentials"
        })
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch OAuth2 token from ThronesDB: ${response.statusText}`);
    }

    const accessTokenData = (await response.json()) as OAuthTokenResponse;
    await dataService.redis.set(THRONESDB_TOKEN_REDIS_KEY, accessTokenData.access_token, {
        expiration: {
            type: "EX",
            value: accessTokenData.expires_in - 60
        }
    });

    return accessTokenData.access_token;
}

/**
 * Fetches & converts a deck from ThronesDB, returning undefined if it cannot be found (eg. deleted or private).
 */
export async function fetchTDBDeck(identifier: number | UUID): Promise<IDecklist | undefined> {
    let response: Response;
    if (typeof identifier === "number") {
        // Id decks are publicly available
        response = await fetch(`${THRONESDB_URL}/api/public/decklist/${identifier}`);
    } else {
        // UUID decks require protected API (auth)
        const authToken = await getThronesDBToken();
        response = await fetch(`${THRONESDB_URL}/api/oauth2/deck/load/${identifier}`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
    }
    if (!response.ok) {
        if (response.status === 404) {
            return undefined;
        }
        throw new Error(`Failed to fetch deck with identifier "${identifier}": ${response.statusText}`);
    }

    const json = await response.json();
    return convertTDBDeck(json);
}

export function pascalCase(value: string) {
    return startCase(camelCase(value)).replace(/ /g, "");
}

// Shared middleware: loads a project by :number param into res.locals.project
// Works for routes where the project param is named "number"
// Loads the project named by the route's :project param into res.locals.project
export const loadProject = asyncHandler<{ project: number }, unknown, unknown, unknown>(async (req, res, next) => {
    const { project: number } = req.params;
    if ((res.locals.project as IProject | undefined)?.number === Number(number)) {
        return next();
    }
    const [project] = await dataService.projects.read({ number });
    if (!project) {
        throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Invalid Number", "Project with that number does not exist");
    }
    res.locals.project = project;
    next();
});

// Applies extra filter fields to a single filter or each filter in an array,
// without mutating the original value
export function applyToFilter<TFilter extends SingleOrArray<object> | undefined>(
    filter: TFilter,
    extra: object
): TFilter {
    if (Array.isArray(filter)) {
        return filter.map((f) => ({ ...f, ...extra })) as TFilter;
    }
    return { ...(filter ?? {}), ...extra } as TFilter;
}
