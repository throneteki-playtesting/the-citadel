import { memo } from "react";
import classNames from "classnames";
import { answerTileClasses } from "../../constants";

// One large answer tile, shared by every question answered by tapping
const AnswerTileButton = memo(function AnswerTileButton({
    label,
    description,
    isOn,
    isDisabled,
    onPress
}: {
    label: string;
    description: string;
    isOn: boolean;
    isDisabled?: boolean;
    onPress: () => void;
}) {
    return (
        <button
            type="button"
            disabled={isDisabled}
            aria-pressed={isOn}
            onClick={onPress}
            className={classNames(
                "flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors",
                answerTileClasses(isOn, isDisabled)
            )}
        >
            <span className={classNames("text-sm font-semibold", isOn ? "text-primary" : "text-foreground/80")}>
                {label}
            </span>
            <span className="text-xs text-foreground/60">{description}</span>
        </button>
    );
});

export default AnswerTileButton;
