import { ICardSuggestion } from "common/models/cards";
import Permission from "common/models/permissions";
import classNames from "classnames";
import { memo } from "react";
import PermissionedLink from "../../components/permissionedLink";
import { LONG_PRESS_MS } from "../../constants";
import { useLongPress } from "../../hooks/useLongPress";
import SuggestionCard from "./suggestionCard";

// The Link + aspect-ratio + hover-scale wrapper ProjectContent gives ProjectContentCard - kept
// separate from SuggestionCard itself so the card stays a pure visual.

// The scale lives on an INNER div, not the link itself - the link (the actual hit-target) always
// fills its container exactly, or a real hand tremor at the card's edge flickers :hover on and off.

// Never handed a draft - the feed and the "All Suggestions" grid both fetch non-draft suggestions
// only (drafts don't mix into the general pool), and a draft's own card is MyDraftsModal's DraftCard.
function SuggestionCardLink({
    suggestion,
    showLikesBadge,
    isSelecting,
    isSelected,
    onToggle,
    onLongPress
}: SuggestionCardLinkProps) {
    // Mirrors projectContent.tsx's own per-card aspect swap - a plot stays landscape at the same
    // column width, so it ends up shorter next to non-plots, not narrower.
    const isPlot = suggestion.card.type === "plot";
    // Holding a card is how a phone starts picking several - the same gesture the Suggestion Spread wheel uses
    const longPress = useLongPress(LONG_PRESS_MS);
    const id = suggestion.id!;

    // Not a <button> in selection mode - the card's own reaction buttons sit inside it, held inert
    if (isSelecting) {
        return (
            <div className={classNames("w-full", isPlot ? "aspect-[333/240]" : "aspect-[240/333]")}>
                <div
                    role="checkbox"
                    tabIndex={0}
                    aria-checked={isSelected}
                    aria-label={`Select ${suggestion.card.name}`}
                    onClick={() => onToggle?.(id)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onToggle?.(id);
                        }
                    }}
                    className="group block w-full h-full relative cursor-pointer select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    <div inert className="w-full h-full">
                        <SuggestionCard
                            suggestion={suggestion}
                            showLikesBadge={showLikesBadge}
                            isSelecting
                            isSelected={isSelected}
                        />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className={classNames(
                "w-full [-webkit-touch-callout:none]",
                isPlot ? "aspect-[333/240]" : "aspect-[240/333]"
            )}
            {...(onLongPress && longPress.bind(() => onLongPress(id)))}
            // The release which ends a hold is still a click - caught before the link sees it, so it doesn't navigate
            onClickCapture={(e) => {
                if (onLongPress && longPress.consumeLongPress()) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }}
        >
            <PermissionedLink
                to={`/suggestions/${suggestion.id}`}
                requires={Permission.READ_SUGGESTIONS}
                className="group block w-full h-full hover:z-20 relative"
            >
                <div className="w-full h-full scale-[0.98] transition-transform duration-200 ease-out group-hover:scale-100">
                    <SuggestionCard suggestion={suggestion} showLikesBadge={showLikesBadge} />
                </div>
            </PermissionedLink>
        </div>
    );
}

// Memoised, with callbacks taking the id, so picking one card re-renders that card alone
export default memo(SuggestionCardLink);

type SuggestionCardLinkProps = {
    suggestion: ICardSuggestion;
    /** Only true from the All Suggestions grid while sorted by Likes - see suggestionCard.tsx. */
    showLikesBadge?: boolean;
    /** Offered by the All Suggestions grid, which can act on several suggestions at once. While picking, a tap picks rather than opening */
    isSelecting?: boolean;
    isSelected?: boolean;
    onToggle?: (id: string) => void;
    /** Held on a touch screen - starts picking, with this one picked */
    onLongPress?: (id: string) => void;
};
