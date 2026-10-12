import { faEyeLowVision, faEye as faEyeFull, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { faEye as faEyeRegular } from "@fortawesome/free-regular-svg-icons";
import { IPlaytestCard } from "common/models/cards";
import { isPreviewOutdated, previewedCard } from "common/models/slots";

export { isPreviewOutdated };

export type RevealAction = "reveal" | "update" | "replace" | "withdraw";

export const revealLabels: Record<RevealAction, string> = {
    reveal: "Reveal Favoured",
    update: "Update Reveal",
    replace: "Replace Reveal",
    withdraw: "Withdraw Reveal"
};

export const revealIcons = {
    reveal: faEyeFull,
    update: faEyeRegular,
    replace: faEyeLowVision,
    withdraw: faEyeSlash
};

// What can be done with a slot's reveal, given its options in order of preference
export function revealActions(options: IPlaytestCard[], preview?: IPlaytestCard): RevealAction[] {
    const [favoured] = options;
    if (!preview) {
        return favoured ? ["reveal"] : [];
    }
    const previewed = previewedCard(options, preview);
    const actions: RevealAction[] = [];
    if (previewed && isPreviewOutdated(previewed, preview)) {
        actions.push("update");
    }
    if (favoured && previewed !== favoured) {
        actions.push("replace");
    }
    return [...actions, "withdraw"];
}

// The part of those which belongs to one card - the revealed one is updated and withdrawn, the Favoured revealed or replaced
export function cardRevealActions(card: IPlaytestCard, options: IPlaytestCard[], preview?: IPlaytestCard) {
    const isFavoured = options[0] === card;
    const isPreviewed = previewedCard(options, preview) === card;
    return revealActions(options, preview).filter((action) =>
        action === "reveal" || action === "replace" ? isFavoured : isPreviewed
    );
}
