import { memo } from "react";
import { AbilityType, abilityTypes } from "common/models/cards";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt, faCircleDot, faWandMagicSparkles, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { BaseElementProps } from "../../types";
import { TouchTooltip } from "../touchTooltip";
import { answerTileClasses } from "../../constants";

/** Title + body, matching the dim-caps-label-over-content shape `AssigneeAvatar` uses elsewhere */
function AutoDetectedTooltip({ body }: { body: string }) {
    return (
        <div className="max-w-56 py-0.5">
            <div className="flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-wide text-foreground/50">
                <FontAwesomeIcon icon={faWandMagicSparkles} />
                Automatically Detected
            </div>
            <div className="mt-1 text-xs leading-relaxed text-foreground/80">{body}</div>
        </div>
    );
}

const META: Record<AbilityType, { label: string; icon: IconDefinition }> = {
    triggered: { label: "Triggered Abilities", icon: faBolt },
    passive: { label: "Passive Abilities", icon: faCircleDot }
};

const EMPTY_AUTO_DETECTED: AbilityType[] = [];

/** 0-many - a card can have either, both, or neither. Compact and horizontal on purpose: this is a
 *  quick classification, not a decision that needs room to explain itself. */
const AbilityTypeToggle = ({
    className,
    style,
    value,
    onChange,
    isDisabled,
    autoDetected = EMPTY_AUTO_DETECTED
}: AbilityTypeToggleProps) => {
    const toggle = (type: AbilityType) => {
        onChange(value.includes(type) ? value.filter((t) => t !== type) : [...value, type]);
    };

    return (
        <div className={classNames("grid grid-cols-1 sm:grid-cols-2 gap-2", className)} style={style}>
            {abilityTypes.map((type) => {
                const isOn = value.includes(type);
                const isDetected = autoDetected.includes(type);
                return (
                    <button
                        type="button"
                        key={type}
                        disabled={isDisabled}
                        aria-pressed={isOn}
                        onClick={() => toggle(type)}
                        className={classNames(
                            "relative flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                            answerTileClasses(isOn, isDisabled),
                            isOn ? "text-primary" : "text-foreground/70"
                        )}
                    >
                        <FontAwesomeIcon icon={META[type].icon} />
                        {META[type].label}
                        {/* Seeded from the ability text - shown whichever way the answer sits, with only
                        the colour changing (matches vs. a real disagreement worth a second look). */}
                        {isDetected && (
                            <TouchTooltip
                                content={
                                    <AutoDetectedTooltip
                                        body={
                                            isOn
                                                ? "The ability text matches this type. You can override this manually if it's not accurate."
                                                : "The ability text still matches this type, even though it's turned off here. Are you sure?"
                                        }
                                    />
                                }
                            >
                                <span
                                    className={classNames(
                                        "absolute right-1 flex size-6 animate-pulse items-center justify-center rounded-full text-xs bg-content1",
                                        isOn ? "text-primary" : "text-warning"
                                    )}
                                >
                                    <FontAwesomeIcon icon={faWandMagicSparkles} />
                                </span>
                            </TouchTooltip>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

type AbilityTypeToggleProps = Omit<BaseElementProps, "children"> & {
    value: AbilityType[];
    onChange: (value: AbilityType[]) => void;
    isDisabled?: boolean;
    /** which of `value` were seeded from the card's own text, rather than a manual click - see editSuggestionModal.tsx */
    autoDetected?: AbilityType[];
};

export default memo(AbilityTypeToggle);
