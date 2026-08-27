import { IPlaytestCard } from "common/models/cards";

/**
 * What a version calls itself on a tab. Its own module since two pages now label the same versions.
 * `isReleaseBound` answers for *this* card, not the slot: only the top of the stack can print the release.
 */
export function versionLabel(card: IPlaytestCard, isReleaseBound: boolean): string {
    if (card.latest && card.released) {
        return "Release";
    }
    if ((card.latest || card.draft) && isReleaseBound) {
        return "Release";
    }
    if (card.latest) {
        return "Latest";
    }
    if (card.draft) {
        return "Draft";
    }
    return card.version;
}
