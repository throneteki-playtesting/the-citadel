import { ILabeledCard, NoteType } from "common/models/cards";
import { IGetResponse } from "./types";
import { IDecklist } from "common/models/decks";

export const NoteVersion: Record<NoteType, "major" | "minor" | "patch" | undefined> = {
    "replaced": "major",
    "reworked": "minor",
    "updated": "patch",
    "implemented": undefined
};

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
        ...(obj.type_code === "character" && { icons: { military: obj.is_military, intrigue: obj.is_intrigue, power: obj.is_power } }),
        illustrator: obj.illustrator,
        ...(obj.faction_code !== "neutral" && { loyal: obj.is_loyal }),
        name: obj.name,
        ...(obj.type_code === "plot" && { plotStats: { income: obj.income, initiative: obj.initiative, claim: obj.claim, reserve: obj.reserve } }),
        traits: obj.traits.split(".").map((trait: string) => trait.trim().replace(/\.$/, "")).filter((trait: string) => !!trait),
        text: obj.text,
        type: obj.type_code,
        ...(["character", "attachment", "location"].includes(obj.type_code) && { unique: obj.is_unique }),
        quantity: obj.quantity,
        imageUrl: obj.image_url,
        workInProgress: obj.work_in_progress,
        label: obj.label
    };
}