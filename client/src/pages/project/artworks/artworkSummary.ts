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
    /** The artwork read as one run, whoever made it always first - see `artworkDetails` */
    details: string[];
    /** The same checklist the editor shows, or empty when the artist list isn't readable */
    requirements: IArtworkRequirement[];
    /** The prep the checklist would list, which is nothing at all until a type is chosen */
    prep: IArtworkPrep[];
    /** Open checklist rows, all of prep counting as the one row it renders as */
    remaining: number;
    /** The piece the card would actually print with, once one has been settled on */
    finalUrl?: string;
}

const NO_ARTIST = "No artist";

// One run of facts about the artwork, whoever made it always leading so a list of cards skims consistently
function artworkDetails(slot: ISlot, artist: IArtist | undefined, artists: IArtist[]): string[] {
    const { artwork } = slot.statuses;

    switch (artwork.type) {
        case "sourced": {
            const options = artwork.sourced?.options ?? [];
            if (options.length === 0) {
                return [artist?.name ?? NO_ARTIST, "No options yet"];
            }
            const granted = options.filter((option) => hasArtistPermission(option, artists)).length;
            return [
                artist?.name ?? NO_ARTIST,
                `${options.length} ${options.length === 1 ? "option" : "options"}`,
                `${granted} granted`
            ];
        }
        case "commissioned": {
            const commissioned = artwork.commissioned;
            const details = [artist?.name ?? NO_ARTIST];
            const due = commissioned?.estimatedCompletion && new Date(commissioned.estimatedCompletion);
            if (due && !isNaN(due.getTime())) {
                details.push(`Due ${due.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`);
            }
            if (commissioned?.cost) {
                details.push(formatCurrency(commissioned.cost.amount, commissioned.cost.currency));
            }
            if (commissioned?.paidBy?.trim()) {
                details.push(`Paid by ${commissioned.paidBy.trim()}`);
            }
            return details;
        }
        case "ai": {
            // Nobody's hand made this one, so what generated it is the nearest thing to its maker
            return [artwork.ai?.resource?.trim() || "AI generated"];
        }
        default:
            return [];
    }
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

        const requirements = includeRequirements ? artworkRequirements(artwork, artists) : [];
        const prep = visiblePrep(artwork);
        const artist = creditedArtist(slot, artists);

        return {
            slot,
            card,
            name: card?.name ?? `Slot ${slot.number}`,
            percent: cardLaneBreakdown(slot.statuses).artwork,
            artist,
            details: artworkDetails(slot, artist, artists),
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

/** Everything a reader might type to find a card, in one string - mirrors the Playtesting Update filter */
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
        row.details.join(" "),
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
