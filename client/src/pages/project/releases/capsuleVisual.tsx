import classNames from "classnames";
import { useSortable } from "@dnd-kit/sortable";
import { IPlaytestCard } from "common/models/cards";
import ThronesIcon from "../../../components/thronesIcon";
import { factionBgClasses, factionBorderClasses } from "../../../constants";

export default function CapsuleVisual({ card, className, style, forwardRef, listeners, attributes, draggable = true, flipSlot }: CapsuleVisualProps) {
    return (
        <div
            ref={forwardRef}
            style={style}
            data-flip-slot={flipSlot}
            {...listeners}
            {...attributes}
            className={classNames(
                "flex items-center gap-1.5 px-2 rounded-md border-2 select-none touch-none z-20",
                draggable ? "cursor-grab" : "cursor-default",
                factionBorderClasses[card.faction],
                factionBgClasses[card.faction],
                className
            )}
        >
            <ThronesIcon name={card.type} className="shrink-0 text-sm opacity-60"/>
            <span className="flex-1 min-w-0 truncate whitespace-nowrap text-xs font-sans leading-tight">{card.name}</span>
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
    // Marks this capsule as a FLIP target (see useCapsuleFlip); omit on DragOverlay copies
    flipSlot?: number;
}
