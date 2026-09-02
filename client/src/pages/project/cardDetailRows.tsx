import { ReactNode } from "react";
import { IPlaytestCard } from "common/models/cards";
import { IProject } from "common/models/projects";
import { checksClosedBy, ISlot } from "common/models/slots";
import { IArtist, commissionPaymentLabel, creditedArtistId, illustratorName } from "common/models/artwork";
import { getFinalCardNumber, parseCardCode } from "common/utils";
import CardDetailRow, { ICardDetailRow } from "./cardDetailRow";

function buildRowData(
    cards: IPlaytestCard[],
    slots: ISlot[],
    project: Pick<IProject, "releases">,
    artists: IArtist[],
    currentUserId: string | undefined,
    canSubmitReleaseCheck: boolean
): ICardDetailRow[] {
    const slotsByNumber = new Map(slots.map((slot) => [slot.number, slot]));

    return cards.map((card) => {
        const slot = slotsByNumber.get(card.number);
        // card.illustrator is authoritative once set (see the publish-time backfill in releases.ts)
        const artwork = slot?.statuses.artwork;
        const creditedArtist = artwork && artists.find((artist) => artist.id === creditedArtistId(artwork));
        const commissioned = artwork?.type === "commissioned" ? artwork.commissioned : undefined;

        const releaseCheckEntry = slot?.statuses.design.checks.release.find(
            (entry) => entry.createdBy === currentUserId
        );
        const checksClosed = !!slot && !!checksClosedBy(slot.statuses.design.status);
        const wantsReleaseCheck = canSubmitReleaseCheck && !checksClosed;

        return {
            card,
            illustrator: card.illustrator || (artwork && illustratorName(artwork, artists)),
            portfolio: creditedArtist?.portfolio,
            commissionNote: commissionPaymentLabel(commissioned),
            releaseNumber: slot && getFinalCardNumber(project, slot),
            packCode: slot?.release?.code,
            releaseCheckEntry,
            wantsReleaseCheck
        };
    });
}

/** For the Projects page's detail view: raw card data, given the cards, their slots, the project and artists */
export function buildDetailRows(
    cards: IPlaytestCard[],
    slots: ISlot[],
    project: Pick<IProject, "releases">,
    artists: IArtist[],
    currentUserId: string | undefined,
    canSubmitReleaseCheck: boolean,
    onOpenReleaseCheck: (card: IPlaytestCard) => void
): ReactNode[] {
    return buildRowData(cards, slots, project, artists, currentUserId, canSubmitReleaseCheck).map((entry) => (
        <CardDetailRow
            key={parseCardCode(false, entry.card.project, entry.card.number)}
            entry={entry}
            onOpenReleaseCheck={onOpenReleaseCheck}
        />
    ));
}
