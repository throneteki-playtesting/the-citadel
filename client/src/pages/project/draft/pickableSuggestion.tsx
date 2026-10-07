import { memo } from "react";
import { Chip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { ICardSuggestion } from "common/models/cards";
import SuggestionCardPreview from "../../../components/suggestionCardPreview";

// A suggestion as a toggle - the padding is the ring's room, so a pick at the grid's edge is never cut off
const PickableSuggestion = memo(function PickableSuggestion({
    suggestion,
    isPicked,
    isDimmed,
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
            className="relative block w-full cursor-pointer select-none self-start p-1 text-left disabled:cursor-default"
        >
            <SuggestionCardPreview
                suggestion={suggestion}
                orientation={suggestion.card.type === "plot" ? undefined : "vertical"}
                rounded={true}
                className={classNames("transition", {
                    "ring-2 ring-primary": isPicked,
                    "brightness-50": isDimmed && !isPicked && !isUsed,
                    "opacity-40 grayscale": isUsed
                })}
            />
            {isPicked && (
                <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground">
                    <FontAwesomeIcon icon={faCheck} />
                </span>
            )}
            {isUsed && (
                <Chip size="sm" variant="solid" className="absolute left-2 top-2">
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
    /** The slot already holding this suggestion, which takes it out of the choice */
    usedIn?: number;
    onToggle: (suggestion: ICardSuggestion) => void;
};
