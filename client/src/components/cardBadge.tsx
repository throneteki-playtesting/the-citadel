import classNames from "classnames";
import { Faction, Type } from "common/models/cards";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { factionBgClasses, factionBorderClasses } from "../constants";
import ThronesIcon from "./thronesIcon";
import { TouchTooltip } from "./touchTooltip";

// Shared visual for anything backed by an `ICard` (faction colour + type icon + name). `onRemove`
// is optional - only a picker's selected chips pass it.

// `imageUrl`'s preview tooltip wraps only the name/icon span, not the whole badge - the remove
// button sits OUTSIDE it, or the tooltip's own tap-handling would swallow the button's click.
export default function CardBadge({ faction, type, name, suffix, onRemove, imageUrl }: CardBadgeProps) {
    const nameBlock = (
        <span className={classNames("inline-flex items-center gap-1 min-w-0", imageUrl && "cursor-help")}>
            <ThronesIcon name={type} className="shrink-0" />
            <span className="truncate">
                {name}
                {suffix ? ` (${suffix})` : ""}
            </span>
        </span>
    );

    return (
        <span
            className={classNames(
                "inline-flex items-center gap-1 align-middle px-2 py-0.5 rounded-full border text-xs font-medium min-w-0",
                factionBgClasses[faction],
                factionBorderClasses[faction],
                onRemove && "pr-1"
            )}
        >
            {imageUrl ? (
                <TouchTooltip
                    size="sm"
                    delay={200}
                    closeDelay={0}
                    content={<img src={imageUrl} alt={name} className="w-40 rounded" />}
                >
                    {nameBlock}
                </TouchTooltip>
            ) : (
                nameBlock
            )}
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={`Remove ${name}`}
                    className="shrink-0 ml-0.5 cursor-pointer text-foreground/50 hover:text-danger"
                >
                    <FontAwesomeIcon icon={faXmark} className="text-[0.6rem]" />
                </button>
            )}
        </span>
    );
}

type CardBadgeProps = {
    faction: Faction;
    type: Type;
    name: string;
    suffix?: string;
    onRemove?: () => void;
    imageUrl?: string;
};
