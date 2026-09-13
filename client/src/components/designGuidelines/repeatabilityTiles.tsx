import { memo } from "react";
import { IRepeatability } from "common/models/cards";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCoins, faHourglassEnd, faLock, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { BaseElementProps } from "../../types";
import { answerTileClasses } from "../../constants";

export const REPEATABILITY_TILES: {
    key: keyof IRepeatability;
    label: string;
    description: string;
    example: string;
    icon: IconDefinition;
}[] = [
    {
        key: "oneTime",
        label: "One-time",
        description: "Likely to fire once, by design.",
        example: "Interrupt: When Shireen Baratheon is killed...",
        icon: faHourglassEnd
    },
    {
        key: "hardLimit",
        label: "Hard Limit",
        description: "A printed limit caps how many times it can be used.",
        example: "(Max 1 per round.)",
        icon: faLock
    },
    {
        key: "paidCost",
        label: "Paid Cost",
        description: "Using it costs a resource each time.",
        example: "Action: Kneel Flea Bottom and discard 1 gold from it to...",
        icon: faCoins
    }
];

/** Three independent toggles, styled like the artwork tab's type picker - border + tint, no motion */
const RepeatabilityTiles = ({ className, style, value, onChange, isDisabled }: RepeatabilityTilesProps) => {
    const toggle = (key: keyof IRepeatability) => {
        onChange({ ...value, [key]: !value[key] });
    };
    return (
        <div className={classNames("grid grid-cols-1 md:grid-cols-3 gap-2", className)} style={style}>
            {REPEATABILITY_TILES.map((tile) => {
                const isOn = !!value[tile.key];
                return (
                    <button
                        type="button"
                        key={tile.key}
                        disabled={isDisabled}
                        onClick={() => toggle(tile.key)}
                        className={classNames(
                            "flex items-start gap-2 rounded-lg border p-2 text-left transition-colors",
                            answerTileClasses(isOn, isDisabled)
                        )}
                    >
                        <FontAwesomeIcon
                            icon={tile.icon}
                            className={classNames("mt-0.5 shrink-0", isOn ? "text-primary" : "text-foreground/40")}
                        />
                        <span className="flex min-w-0 flex-col gap-0.5">
                            <span
                                className={classNames(
                                    "text-sm font-semibold",
                                    isOn ? "text-primary" : "text-foreground/80"
                                )}
                            >
                                {tile.label}
                            </span>
                            <span className="text-xs text-foreground/60">{tile.description}</span>
                            <span className="text-xs italic text-foreground/40">{tile.example}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
};

type RepeatabilityTilesProps = Omit<BaseElementProps, "children"> & {
    value: IRepeatability;
    onChange: (value: IRepeatability) => void;
    isDisabled?: boolean;
};

export default memo(RepeatabilityTiles);
