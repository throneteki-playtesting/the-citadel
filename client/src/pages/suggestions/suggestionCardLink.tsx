import { ICardSuggestion } from "common/models/cards";
import Permission from "common/models/permissions";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
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
export default function SuggestionCardLink({ suggestion, showLikesBadge, selection }: SuggestionCardLinkProps) {
    // Mirrors projectContent.tsx's own per-card aspect swap - a plot stays landscape at the same
    // column width, so it ends up shorter next to non-plots, not narrower.
    const isPlot = suggestion.card.type === "plot";
    // Holding a card is how a phone starts picking several - the same gesture the Suggestion Spread wheel uses
    const longPress = useLongPress(LONG_PRESS_MS);

    const card = (
        <div className="w-full h-full scale-[0.98] transition-transform duration-200 ease-out group-hover:scale-100">
            <SuggestionCard suggestion={suggestion} showLikesBadge={showLikesBadge} />
        </div>
    );

    if (selection?.isSelecting) {
        return (
            <div className={classNames("w-full", isPlot ? "aspect-[333/240]" : "aspect-[240/333]")}>
                {/* Not a <button> - the card's own reaction buttons sit inside it, held inert while picking */}
                <div
                    role="checkbox"
                    tabIndex={0}
                    aria-checked={selection.isSelected}
                    aria-label={`Select ${suggestion.card.name}`}
                    onClick={selection.onToggle}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selection.onToggle();
                        }
                    }}
                    className="group block w-full h-full relative cursor-pointer select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    <div
                        inert
                        className={classNames(
                            "w-full h-full rounded-lg transition",
                            selection.isSelected ? "ring-2 ring-primary" : "opacity-70 group-hover:opacity-100"
                        )}
                    >
                        {card}
                    </div>
                    <span
                        className={classNames(
                            "absolute right-1.5 top-1.5 z-10 grid size-6 place-items-center rounded-full border-2 text-xs transition",
                            selection.isSelected
                                ? "bg-primary border-primary text-primary-foreground"
                                : "bg-black/40 border-white/70 text-transparent"
                        )}
                    >
                        <FontAwesomeIcon icon={faCheck} />
                    </span>
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
            {...(selection && longPress.bind(selection.onLongPress))}
            // The release which ends a hold is still a click - caught before the link sees it, so it doesn't navigate
            onClickCapture={(e) => {
                if (selection && longPress.consumeLongPress()) {
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
                {card}
            </PermissionedLink>
        </div>
    );
}

type SuggestionCardLinkProps = {
    suggestion: ICardSuggestion;
    /** Only true from the All Suggestions grid while sorted by Likes - see suggestionCard.tsx. */
    showLikesBadge?: boolean;
    /** Offered by the All Suggestions grid, which can act on several suggestions at once */
    selection?: {
        /** While picking, a tap picks rather than opening the suggestion */
        isSelecting: boolean;
        isSelected: boolean;
        onToggle: () => void;
        /** Held on a touch screen - starts picking, with this one picked */
        onLongPress: () => void;
    };
};
