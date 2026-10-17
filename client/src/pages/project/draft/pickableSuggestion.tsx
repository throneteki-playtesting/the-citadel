import { memo } from "react";
import { Chip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { ICardSuggestion } from "common/models/cards";
import SuggestionCardPreview from "../../../components/suggestionCardPreview";
import SuggestionLikesBadge from "../../../components/suggestionLikesBadge";

// A suggestion as a toggle - its ring is drawn outside it, so the grid leaves room for a pick at its edge, and the gap
// between two picked side by side is left a pixel clear
const PickableSuggestion = memo(function PickableSuggestion({
    suggestion,
    isPicked,
    isDimmed,
    showLikes,
    usedIn,
    onToggle
}: PickableSuggestionProps) {
    const isUsed = usedIn !== undefined;
    return (
        <button
            type="button"
            aria-pressed={isPicked}
            aria-label={suggestion.card.name}
            disabled={isUsed}
            onClick={() => onToggle(suggestion)}
            className="relative block w-full cursor-pointer select-none self-start text-left disabled:cursor-default"
        >
            <SuggestionCardPreview
                suggestion={suggestion}
                orientation={suggestion.card.type === "plot" ? undefined : "vertical"}
                rounded={true}
                className={classNames("transition", {
                    "ring-[1.5px] ring-primary": isPicked,
                    "brightness-50": isDimmed && !isPicked && !isUsed,
                    "opacity-40 grayscale": isUsed
                })}
            />
            {isPicked && (
                <span className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground">
                    <FontAwesomeIcon icon={faCheck} />
                </span>
            )}
            <SuggestionLikesBadge suggestion={suggestion} isShown={!!showLikes} />
            {isUsed && (
                <Chip size="sm" variant="solid" className="absolute left-1 top-1">
                    In slot #{usedIn}
                </Chip>
            )}
        </button>
    );
});

export default PickableSuggestion;

type PickableSuggestionProps = {
    suggestion: ICardSuggestion;
    isPicked: boolean;
    /** Something else has been picked, so what hasn't steps back */
    isDimmed: boolean;
    /** The list is sorted by likes, so each shows how many it has */
    showLikes?: boolean;
    /** The slot already holding this suggestion, which takes it out of the choice */
    usedIn?: number;
    onToggle: (suggestion: ICardSuggestion) => void;
};
