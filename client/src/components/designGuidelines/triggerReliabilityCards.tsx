import { memo } from "react";
import { TRIGGER_RELIABILITIES, TriggerReliabilityIcon } from "common/designGuidelines/computeStrength";
import { TriggerReliability } from "common/models/cards";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsRotate, faHandPointer, faLink, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { BaseElementProps } from "../../types";
import { answerTileClasses } from "../../constants";

const ICONS: Record<TriggerReliabilityIcon, IconDefinition> = {
    recur: faArrowsRotate,
    pointer: faHandPointer,
    link: faLink
};

/** Compact cards, styled like the artwork tab's type picker - border + tint, no motion */
const TriggerReliabilityCards = ({ className, style, value, onChange, isDisabled }: TriggerReliabilityCardsProps) => {
    const toggle = (id: TriggerReliability) => {
        onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
    };

    return (
        <div className={classNames("grid grid-cols-1 md:grid-cols-3 gap-2", className)} style={style}>
            {TRIGGER_RELIABILITIES.map((option) => {
                const isOn = value.includes(option.id);
                return (
                    <button
                        type="button"
                        key={option.id}
                        disabled={isDisabled}
                        onClick={() => toggle(option.id)}
                        aria-pressed={isOn}
                        className={classNames(
                            "flex items-start gap-2 rounded-lg border p-2 text-left transition-colors",
                            answerTileClasses(isOn, isDisabled)
                        )}
                    >
                        <FontAwesomeIcon
                            icon={ICONS[option.icon]}
                            className={classNames("mt-0.5 shrink-0", isOn ? "text-primary" : "text-foreground/40")}
                        />
                        <span className="flex min-w-0 flex-col gap-0.5">
                            <span
                                className={classNames(
                                    "text-sm font-semibold",
                                    isOn ? "text-primary" : "text-foreground/80"
                                )}
                            >
                                {option.label}
                            </span>
                            <span className="text-xs text-foreground/60">{option.description}</span>
                            <span className="text-xs italic text-foreground/40">{option.example}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
};

type TriggerReliabilityCardsProps = Omit<BaseElementProps, "children"> & {
    value: TriggerReliability[];
    onChange: (value: TriggerReliability[]) => void;
    isDisabled?: boolean;
};

export default memo(TriggerReliabilityCards);
