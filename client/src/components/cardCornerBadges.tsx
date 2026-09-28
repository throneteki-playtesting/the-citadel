import { MouseEventHandler, ReactNode } from "react";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { TouchTooltip } from "./touchTooltip";
import { cornerBadgeFadeClasses } from "../constants";

const RING_CLASSES = {
    primary: "ring-primary/70",
    warning: "ring-warning/70"
} as const;

const ICON_CLASSES = {
    primary: "text-primary",
    warning: "text-warning"
} as const;

export type CornerBadgeProps = {
    icon: IconDefinition;
    /** The tooltip's heading, beside the badge's own icon */
    title: ReactNode;
    description?: ReactNode;
    /** A small bubble on the badge's corner, eg. a count */
    count?: ReactNode;
    color?: keyof typeof RING_CLASSES;
    /** Overrides the icon's colour (or adds a glow) where it shouldn't simply follow `color` */
    iconClassName?: string;
    /** For a state still in progress, eg. a draft being written */
    pulse?: boolean;
    onClick?: MouseEventHandler<HTMLDivElement>;
    onAuxClick?: MouseEventHandler<HTMLDivElement>;
};

/** One round badge over a card's corner - the icon on a dark disc, explained by its tooltip */
export function CornerBadge({
    icon,
    title,
    description,
    count,
    color = "primary",
    iconClassName,
    pulse,
    onClick,
    onAuxClick
}: CornerBadgeProps) {
    return (
        <TouchTooltip
            content={
                <div className="max-w-64 px-1 py-0.5">
                    <div className="text-sm font-cinzel">
                        <FontAwesomeIcon icon={icon} /> {title}
                    </div>
                    {description && <div className="text-xs">{description}</div>}
                </div>
            }
        >
            <div
                onClick={onClick}
                onAuxClick={onAuxClick}
                className={classNames(
                    "relative flex items-center justify-center size-8 rounded-full bg-black/60 ring-1",
                    cornerBadgeFadeClasses,
                    RING_CLASSES[color],
                    { "animate-pulse": pulse, "cursor-pointer": !!onClick }
                )}
            >
                <FontAwesomeIcon icon={icon} className={classNames("text-lg", iconClassName ?? ICON_CLASSES[color])} />
                {count !== undefined && (
                    <div className="absolute -bottom-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[0.65rem] leading-4 text-center font-bold">
                        {count}
                    </div>
                )}
            </div>
        </TouchTooltip>
    );
}

export type CardCornerBadge = CornerBadgeProps & { key: string };

/** The badges over a card's top-right corner, in one right-aligned row - any left out (false/undefined) take no
 *  room. `children` follow them, for a badge with behaviour of its own the plain spec can't express. */
export default function CardCornerBadges({
    badges,
    isolateClicks = false,
    className,
    leading,
    children
}: CardCornerBadgesProps) {
    const shown = badges.filter((badge): badge is CardCornerBadge => !!badge);
    if (shown.length === 0 && !children && !leading) {
        return null;
    }
    return (
        <div
            className={classNames("absolute top-0 right-0 m-2 z-10 flex items-center gap-1.5", className)}
            onClick={
                isolateClicks
                    ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                      }
                    : undefined
            }
            onPointerDown={isolateClicks ? (e) => e.stopPropagation() : undefined}
        >
            {leading}
            {shown.map(({ key, ...badge }) => (
                <CornerBadge key={key} {...badge} />
            ))}
            {children}
        </div>
    );
}

type CardCornerBadgesProps = {
    badges: (CardCornerBadge | false | null | undefined)[];
    /** Keeps clicks on the badges from reaching the card underneath, when that card is a link */
    isolateClicks?: boolean;
    className?: string;
    /** Before the badges - eg. controls which only appear on hover, and so shouldn't move the badges about */
    leading?: ReactNode;
    children?: ReactNode;
};
