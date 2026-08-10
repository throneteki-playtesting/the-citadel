import { IPlaytestCard } from "common/models/cards";
import { ISlot } from "common/models/slots";
import {
    artworkRequirements,
    finalArtworkUrl,
    hasArtistPermission,
    IArtist,
    IArtworkPrep,
    IArtworkRequirement,
    remainingTasks,
    selectedOption,
    visiblePrep
} from "common/models/artwork";
import { cardLaneBreakdown } from "common/progress/calc";
import { formatCurrency } from "../../../utils";

/** One row of the project's artwork overview, flattened so filtering and sorting never re-derive it */
export interface IArtworkRow {
    slot: ISlot;
    card?: IPlaytestCard;
    name: string;
    /** The artwork lane's own percentage, the same figure the card page shows */
    percent: number;
    artist?: IArtist;
    /** Type-specific one-liner, eg. how many options are in play or what a commission is costing */
    detail?: string;
    /** The same checklist the editor shows, or empty when the artist list isn't readable */
    requirements: IArtworkRequirement[];
    /** The prep the checklist would list, which is nothing at all until a type is chosen */
    prep: IArtworkPrep[];
    /** Open checklist rows, all of prep counting as the one row it renders as */
    remaining: number;
    /** The piece the card would actually print with, once one has been settled on */
    finalUrl?: string;
}

function sourcedDetail(row: ISlot, artists: IArtist[]): string {
    const sourced = row.statuses.artwork.sourced;
    const options = sourced?.options ?? [];
    if (options.length === 0) {
        return "No options yet";
    }
    const granted = options.filter((option) => hasArtistPermission(option, artists)).length;
    const plural = options.length === 1 ? "option" : "options";
    return `${options.length} ${plural} · ${granted} granted`;
}

function commissionedDetail(slot: ISlot): string | undefined {
    const commissioned = slot.statuses.artwork.commissioned;
    if (!commissioned) {
        return undefined;
    }
    const parts: string[] = [];
    if (commissioned.estimatedCompletion) {
        const due = new Date(commissioned.estimatedCompletion);
        if (!isNaN(due.getTime())) {
            parts.push(due.toLocaleDateString(undefined, { day: "numeric", month: "short" }));
        }
    }
    if (commissioned.cost) {
        parts.push(formatCurrency(commissioned.cost.amount, commissioned.cost.currency));
    }
    return parts.join(" · ");
}

function aiDetail(slot: ISlot): string | undefined {
    return slot.statuses.artwork.ai?.resource?.trim() || undefined;
}

/** The artist credited for the artwork, whichever way it is being obtained */
function creditedArtist(slot: ISlot, artists: IArtist[]): IArtist | undefined {
    const { artwork } = slot.statuses;
    const id =
        artwork.type === "commissioned"
            ? artwork.commissioned?.artist
            : (selectedOption(artwork.sourced)?.artist ?? artwork.sourced?.options[0]?.artist);
    return artists.find((artist) => artist.id === id);
}

export function buildArtworkRows(
    slots: ISlot[],
    cards: IPlaytestCard[],
    artists: IArtist[],
    { includeRequirements = true }: { includeRequirements?: boolean } = {}
): IArtworkRow[] {
    const cardsByNumber = new Map(cards.map((card) => [card.number, card]));

    return slots.map((slot) => {
        const { artwork } = slot.statuses;
        const card = cardsByNumber.get(slot.number);

        let detail: string | undefined;
        switch (artwork.type) {
            case "sourced":
                detail = sourcedDetail(slot, artists);
                break;
            case "commissioned":
                detail = commissionedDetail(slot);
                break;
            case "ai":
                detail = aiDetail(slot);
                break;
        }

        const requirements = includeRequirements ? artworkRequirements(artwork, artists) : [];
        const prep = visiblePrep(artwork);

        return {
            slot,
            card,
            name: card?.name ?? `Slot ${slot.number}`,
            percent: cardLaneBreakdown(slot.statuses).artwork,
            artist: creditedArtist(slot, artists),
            detail,
            requirements,
            prep,
            remaining: remainingTasks(requirements, prep),
            finalUrl: finalArtworkUrl(artwork)
        };
    });
}

/** A row wants looking at while anything on its checklist is still open */
export function needsAttention(row: IArtworkRow): boolean {
    return row.remaining > 0;
}

/**
 * Everything a reader might type to find a card, in one string. Mirrors the Playtesting Update filter,
 * which searches across a card rather than asking which field the words belong to.
 */
export function searchHaystack(row: IArtworkRow): string {
    const artwork = row.slot.statuses.artwork;
    return [
        row.name,
        String(row.slot.number),
        row.slot.faction,
        row.card?.type,
        row.card?.text,
        artwork.type,
        artwork.status,
        row.artist?.name,
        row.detail,
        row.slot.release?.code,
        artwork.sourced?.options.map((option) => option.notes).join(" "),
        artwork.commissioned?.notes,
        artwork.ai?.notes,
        artwork.ai?.resource
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}
