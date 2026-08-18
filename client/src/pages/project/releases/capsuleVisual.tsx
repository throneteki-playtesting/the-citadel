import { memo, useRef, useState } from "react";
import classNames from "classnames";
import { useSortable } from "@dnd-kit/sortable";
import { IPlaytestCard } from "common/models/cards";
import Permission from "common/models/permissions";
import { checksClosedBy } from "common/models/slots";
import { cardLaneBreakdown } from "common/progress/calc";
import ThronesIcon from "../../../components/thronesIcon";
import { TouchTooltip } from "../../../components/touchTooltip";
import { usePermission } from "../../../hooks/usePermission";
import { useAuth } from "../../../hooks/useAuth";
import { factionBgClasses, factionBorderClasses } from "../../../constants";
import ReleaseChecksModal from "../../../components/releaseChecksModal";
import ReleaseCheckButton from "./releaseCheckButton";
import ProgressRing from "../../../components/progressRing";
import CardProgressBreakdown from "../../../components/cardProgressBreakdown";
import { useCapsuleSlot } from "./useCapsuleSlot";

// How far a press may travel and still count as a tap rather than a drag
const TAP_MOVE_THRESHOLD = 5;

function CapsuleVisual({
    card,
    className,
    style,
    forwardRef,
    listeners,
    attributes,
    draggable = true,
    onClick,
    onAuxClick,
    flipSlot,
    showProgress = false,
    showReleaseCheck = false,
    hideExtras = false
}: CapsuleVisualProps) {
    const isClickable = !!onClick;
    const { user } = useAuth();
    const pressOrigin = useRef<{ x: number; y: number } | undefined>(undefined);

    const [checksOpen, setChecksOpen] = useState(false);
    // Mounted lazily (then kept, for its close animation) - the modal fetches a slot per mount
    const [checksMounted, setChecksMounted] = useState(false);

    const canReadProgress = usePermission(Permission.READ_STATS_SLOT);
    const canSubmitCheck = usePermission(Permission.SUBMIT_RELEASE_CHECK);
    const wantsProgress = showProgress && canReadProgress;
    const canCheck = showReleaseCheck && canSubmitCheck;

    const slot = useCapsuleSlot(card.project, card.number, !wantsProgress && !canCheck);
    // The same calculation the card's own progress endpoint runs, so the two always agree
    const progress = slot && wantsProgress ? cardLaneBreakdown(slot.statuses) : undefined;
    const myCheck = slot?.statuses.design.checks.find((entry) => entry.createdBy === user?.discordId);
    // Capsules only show while a release is confirming, so only the card's own design can have closed
    // its checks - once it has, the button is worth keeping solely to read a verdict already given
    const checksClosed = !!slot && !!checksClosedBy(slot.statuses.design.status);
    const wantsReleaseCheck = canCheck && (!checksClosed || !!myCheck);

    const typeIcon = <ThronesIcon name={card.type} className="shrink-0 text-xs opacity-60" />;
    // Hidden rather than dropped, so the type icon and name keep the position they'll hold at rest
    const extrasClass = classNames({ invisible: hideExtras });

    // A drag finishing on this capsule still fires a click, so only a press that barely moved counts as a tap
    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        pressOrigin.current = { x: e.clientX, y: e.clientY };
        if (draggable) {
            listeners?.onPointerDown?.(e);
        }
    };

    const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button === 1) {
            e.preventDefault();
        }
        if (draggable) {
            listeners?.onMouseDown?.(e);
        }
    };
    const onCapsuleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const origin = pressOrigin.current;
        pressOrigin.current = undefined;
        if (origin && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > TAP_MOVE_THRESHOLD) {
            return;
        }
        onClick?.(e);
    };

    const dragCursorClass = hideExtras ? "cursor-grabbing" : "cursor-grab active:cursor-grabbing";

    return (
        <>
            <div
                ref={forwardRef}
                style={style}
                data-flip-slot={flipSlot}
                {...(draggable ? listeners : undefined)}
                {...(draggable ? attributes : undefined)}
                onPointerDown={onPointerDown}
                onMouseDown={isClickable ? onMouseDown : undefined}
                onClick={isClickable ? onCapsuleClick : undefined}
                onAuxClick={isClickable ? onAuxClick : undefined}
                className={classNames(
                    "flex items-center gap-1 px-1.5 rounded-md border-2 border-solid select-none touch-manipulation z-10 transition-[filter]",
                    draggable ? dragCursorClass : isClickable ? "cursor-pointer" : "cursor-default",
                    { "hover:brightness-90": isClickable },
                    factionBorderClasses[card.faction],
                    factionBgClasses[card.faction],
                    className
                )}
            >
                {progress ? (
                    <TouchTooltip
                        content={<CardProgressBreakdown progress={progress} />}
                        size="sm"
                        delay={0}
                        closeDelay={0}
                    >
                        <span
                            className="shrink-0 flex cursor-help"
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <ProgressRing value={progress.overall} ringClassName={extrasClass}>
                                {typeIcon}
                            </ProgressRing>
                        </span>
                    </TouchTooltip>
                ) : (
                    typeIcon
                )}
                <span className="flex-1 min-w-0 truncate whitespace-nowrap text-xs font-sans leading-tight">
                    <span className={classNames({ "cursor-pointer": isClickable })}>{card.name}</span>
                </span>
                {wantsReleaseCheck && (
                    <ReleaseCheckButton
                        entry={myCheck}
                        className={extrasClass}
                        // Capsules are fed from a latest:true query, so this is the confirmed version
                        latestVersion={card.version}
                        onPress={() => {
                            setChecksMounted(true);
                            setChecksOpen(true);
                        }}
                    />
                )}
            </div>
            {checksMounted && (
                <ReleaseChecksModal
                    isOpen={checksOpen}
                    onClose={() => setChecksOpen(false)}
                    project={card.project}
                    number={card.number}
                    viewTarget="card"
                />
            )}
        </>
    );
}
// Every slot re-renders on each dnd-kit context change, but the capsule's
// own props hold steady through a drag - so its tooltips and ring stay out of that path
export default memo(CapsuleVisual);

type CapsuleVisualProps = {
    card: IPlaytestCard;
    className?: string;
    style?: React.CSSProperties;
    forwardRef?: (node: HTMLElement | null) => void;
    listeners?: ReturnType<typeof useSortable>["listeners"];
    attributes?: ReturnType<typeof useSortable>["attributes"];
    draggable?: boolean;
    onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
    /** Middle-click - the capsule can't be a real anchor (drag listeners, nested button), so open-in-new-tab is manual */
    onAuxClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
    // Marks this capsule as a FLIP target (see useCapsuleFlip); omit on DragOverlay copies
    flipSlot?: number;
    showProgress?: boolean;
    /** Only meaningful for capsules assigned to a release - the pool is for planning, not feedback */
    showReleaseCheck?: boolean;
    /** Hides the ring and check button without moving anything else - used by the drag overlay */
    hideExtras?: boolean;
};
