import classNames from "classnames";
import { useSortable } from "@dnd-kit/sortable";
import { IPlaytestCard } from "common/models/cards";
import ThronesIcon from "../../../components/thronesIcon";
import { factionBgClasses, factionBorderClasses } from "../../../constants";

export default function CapsuleVisual({
    card,
    className,
    style,
    forwardRef,
    listeners,
    attributes,
    draggable = true,
    onClick,
    flipSlot
}: CapsuleVisualProps) {
    const isClickable = !draggable && !!onClick;

    return (
        <div
            ref={forwardRef}
            style={style}
            data-flip-slot={flipSlot}
            onClick={isClickable ? onClick : undefined}
            {...(draggable ? listeners : undefined)}
            {...(draggable ? attributes : undefined)}
            className={classNames(
                "flex items-center gap-1 px-1.5 rounded-md border-2 border-solid select-none touch-manipulation z-10 transition-[filter]",
                draggable ? "cursor-grab" : isClickable ? "cursor-pointer hover:brightness-90" : "cursor-default",
                factionBorderClasses[card.faction],
                factionBgClasses[card.faction],
                className
            )}
        >
            <ThronesIcon name={card.type} className="shrink-0 text-xs opacity-60" />
            <span className="flex-1 min-w-0 truncate whitespace-nowrap text-xs font-sans leading-tight">
                {card.name}
            </span>
        </div>
    );
}
type CapsuleVisualProps = {
    card: IPlaytestCard;
    className?: string;
    style?: React.CSSProperties;
    forwardRef?: (node: HTMLElement | null) => void;
    listeners?: ReturnType<typeof useSortable>["listeners"];
    attributes?: ReturnType<typeof useSortable>["attributes"];
    draggable?: boolean;
    onClick?: () => void;
    // Marks this capsule as a FLIP target (see useCapsuleFlip); omit on DragOverlay copies
    flipSlot?: number;
};
