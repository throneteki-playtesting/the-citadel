import classNames from "classnames";
import { Tooltip } from "@heroui/react";
import { Faction, Type } from "common/models/cards";
import { factionTextClasses } from "../constants";
import ThronesIcon from "./thronesIcon";

/** A full-width list row (unlike `CardBadge`'s compact pill) - for a dropdown item, the whole
 *  item's space is what's being picked, not a small badge floating inside it. */
// A plain `Tooltip`, deliberately not `TouchTooltip` - the whole row is also what a tap selects,
// and `TouchTooltip`'s tap-to-open would swallow that selection on a touch device.
export default function CardRow({ faction, type, name, imageUrl, className }: CardRowProps) {
    const nameBlock = (
        <div className={classNames("flex items-center gap-2 min-w-0 flex-1", imageUrl && "cursor-help")}>
            <ThronesIcon name={faction} className={classNames("shrink-0", factionTextClasses[faction])} />
            <ThronesIcon name={type} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{name}</span>
        </div>
    );

    return (
        <div className={classNames("flex items-center gap-2 w-full min-w-0 px-2 py-1.5 rounded-md", className)}>
            {imageUrl ? (
                <Tooltip
                    size="sm"
                    delay={200}
                    closeDelay={0}
                    content={<img src={imageUrl} alt={name} className="w-40 rounded" />}
                >
                    {nameBlock}
                </Tooltip>
            ) : (
                nameBlock
            )}
        </div>
    );
}

type CardRowProps = {
    faction: Faction;
    type: Type;
    name: string;
    imageUrl?: string;
    className?: string;
};
