import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Button, Skeleton, Tooltip } from "@heroui/react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { factions, ICardSuggestion } from "common/models/cards";
import { suggestionToPlaytestCard } from "common/utils";
import { useGetPoolQuery, useGetSuggestionsQuery, useRemoveFromPoolMutation } from "../../../api";
import { showApiErrorToast } from "../../../api/errors";
import DraftPoolIcon from "../../../components/draftPoolIcon";
import FloatingPanel from "../../../components/floatingPanel";
import SuggestionCardPreview from "../../../components/suggestionCardPreview";
import { useHasOpened } from "../../../hooks/useHasOpened";
import { useStableCallback } from "../../../hooks/useStableCallback";
import { FLAT_BUTTON_CLASS, POOL_CARD_GRID_CLASS, POOL_READ_LIMIT, POOL_STATUS_FADE } from "../../../constants";
import { DragData, POOLED_FROM, useDragState } from "./draftDragStore";

const SKELETON_CARDS = [0, 1, 2, 3];

// The suggestions set aside for this project: a button in the project's header, opening a panel of the cards still to
// place. A card placed in a slot leaves the panel - and returns to it if that slot lets it go
export default function DraftPool({ project, used, host, onPlace }: DraftPoolProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [originRect, setOriginRect] = useState<DOMRect>();
    // Put away by a card sent to its slot, the panel fades where it is rather than shrinking back to its button
    const [isFading, setIsFading] = useState(false);
    const { data: pool } = useGetPoolQuery({ project });
    const { data: suggestions } = useGetSuggestionsQuery(
        { pooledIn: project, perPage: POOL_READ_LIMIT },
        { skip: !pool?.length }
    );
    const [removeFromPool] = useRemoveFromPoolMutation();
    const remove = useStableCallback(async (suggestion: string) => {
        try {
            await removeFromPool({ project, suggestion }).unwrap();
        } catch (error) {
            showApiErrorToast(error, { title: "Failed to remove from pool" });
        }
    });

    // What is still in the pool - not placed in a slot - in the order it was pooled, then by faction. And how many
    // suggestions have ever been set aside in it, which a deleted suggestion no longer counts toward
    const { cards, pooledCount } = useMemo(() => {
        const byId = new Map(suggestions?.items.map((suggestion) => [suggestion.id, suggestion]));
        const pooled = (pool ?? []).flatMap((entry) => byId.get(entry.suggestion) ?? []);
        const waiting = pooled.filter((suggestion) => !suggestion.id || !used.has(suggestion.id));
        return {
            cards: factions.flatMap((faction) => waiting.filter((suggestion) => suggestion.card.faction === faction)),
            pooledCount: pooled.length
        };
    }, [pool, suggestions, used]);
    const count = cards.length;
    const placedCount = pooledCount - count;
    const isLoading = pool === undefined || (pool.length > 0 && suggestions === undefined);

    // Picking a card up puts the panel away, so the card can be carried to its slot
    const isCarrying = useDragState((state) => !!state.active?.suggestion);
    useEffect(() => {
        if (isCarrying) {
            setIsOpen(false);
        }
    }, [isCarrying]);

    // The panel is put away as the card leaves it, so the page it is bound for can be seen
    const place = useStableCallback((data: DragData, from: DOMRect) =>
        onPlace(data, from, () => {
            setIsFading(true);
            setIsOpen(false);
        })
    );

    const open = useStableCallback((rect: DOMRect) => {
        setIsFading(false);
        setOriginRect(rect);
        setIsOpen(true);
    });
    const hasOpened = useHasOpened(isOpen);

    return (
        <>
            {host &&
                createPortal(
                    <PoolButton
                        count={count}
                        placedCount={placedCount}
                        isEmpty={!pool?.length}
                        isOpen={isOpen}
                        onOpen={open}
                    />,
                    host
                )}
            <PoolBubble count={count} isEmpty={!pool?.length} isOpen={isOpen} onOpen={open} />
            <FloatingPanel
                title={`Draft Pool (${count})`}
                isOpen={isOpen}
                originRect={originRect}
                closeStyle={isFading ? "fade" : "shrink"}
                onClose={() => setIsOpen(false)}
                onClosed={() => setIsFading(false)}
            >
                {(isInteractive) =>
                    !hasOpened ? null : isLoading ? (
                        <ul className={POOL_CARD_GRID_CLASS}>
                            {SKELETON_CARDS.map((card) => (
                                <Skeleton key={card} as="li" className="aspect-[240/333] rounded-md" />
                            ))}
                        </ul>
                    ) : count === 0 ? (
                        <p className="py-8 text-center text-foreground/60">
                            {placedCount > 0
                                ? "Every card in the pool has been placed"
                                : "Nothing has been added to this pool yet"}
                        </p>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <p className="text-sm text-foreground/60">
                                Tap a card to place it in its faction's next slot, or drag it to a slot
                            </p>
                            <ul className={POOL_CARD_GRID_CLASS}>
                                {cards.map((suggestion) => (
                                    <PoolCard
                                        key={suggestion.id}
                                        suggestion={suggestion}
                                        project={project}
                                        isInteractive={isInteractive}
                                        onRemove={remove}
                                        onPlace={place}
                                    />
                                ))}
                            </ul>
                        </div>
                    )
                }
            </FloatingPanel>
        </>
    );
}

type DraftPoolProps = {
    project: number;
    /** Suggestions already an option somewhere in the project, by the slot holding them - these have left the pool */
    used: Map<string, number>;
    /** Where the button is shown - the project's header - until it is there, there is no button */
    host: HTMLElement | null;
    /** A card tapped, which is put in the first slot its faction has for it - flown from where it was drawn */
    onPlace: (data: DragData, from: DOMRect, dismiss: () => void) => void;
};

// A card taken out of a slot which came from a suggestion can be let go over the pool, to go back into it. A new design
// can't, so the pool stands aside for it
function usePoolDrop(id: string) {
    const isDragging = useDragState((state) => !!state.active && state.active.slotNumber !== POOLED_FROM);
    const isAccepting = useDragState((state) => !!state.active?.card.suggestionId && !state.isOrphaned);
    const isOrphaned = useDragState((state) => !!state.isOrphaned);
    const { setNodeRef, isOver } = useDroppable({ id, data: { pool: true }, disabled: !isDragging || !isAccepting });
    return { setNodeRef, isDragging, isAccepting: isDragging && isAccepting, isOrphaned, isOver };
}

type PoolStatus = "accepting" | "orphaned" | "refusing" | "empty" | "summary";
function poolStatus({ isAccepting, isDragging, isOrphaned, isEmpty }: Record<string, boolean>): PoolStatus {
    if (isAccepting) {
        return "accepting";
    }
    if (isDragging) {
        return isOrphaned ? "orphaned" : "refusing";
    }
    return isEmpty ? "empty" : "summary";
}

// The status line sits in one grid cell, so a change of what it says is a fade from one text to the other
const STATUS_TEXT: Record<Exclude<PoolStatus, "summary">, string> = {
    accepting: "Drop to put it back in the pool",
    orphaned: "Its suggestion no longer exists",
    refusing: "A new design can't go in the pool",
    empty: "Nothing pooled yet"
};

// Beside the checklist - it can be larger than the release board's, but is the same plain button
const PoolButton = memo(function PoolButton({ count, placedCount, isEmpty, isOpen, onOpen }: PoolButtonProps) {
    const ref = useRef<HTMLButtonElement>(null);
    const { setNodeRef, isDragging, isAccepting, isOrphaned, isOver } = usePoolDrop("pool-button");
    const status = poolStatus({ isAccepting, isDragging, isOrphaned, isEmpty });
    return (
        <div ref={setNodeRef} data-pool-zone className="h-full w-full">
            <Button
                ref={ref}
                size="lg"
                variant={isOver ? "solid" : "flat"}
                color={isOver ? "primary" : "default"}
                isDisabled={isOpen || (isDragging && !isAccepting) || (isEmpty && !isDragging)}
                className={classNames(
                    "h-full min-h-16 w-full justify-start whitespace-normal py-2 text-left transition-[opacity,box-shadow]",
                    {
                        "opacity-40": isOpen,
                        "ring-2 ring-primary": isAccepting
                    }
                )}
                onPress={() => ref.current && onOpen(ref.current.getBoundingClientRect())}
            >
                <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-2 font-cinzel">
                        <DraftPoolIcon />
                        Draft Pool
                    </span>
                    <span className="grid text-sm font-normal text-foreground/70">
                        <AnimatePresence initial={false}>
                            <motion.span
                                key={status}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={POOL_STATUS_FADE}
                                className="col-start-1 row-start-1 flex flex-wrap items-center gap-x-3 gap-y-0.5"
                            >
                                {status === "summary" ? (
                                    <>
                                        <span>{count + placedCount} total</span>
                                        <span aria-hidden>·</span>
                                        <span>{placedCount} placed</span>
                                        <span aria-hidden>·</span>
                                        <span>{count} remaining</span>
                                    </>
                                ) : (
                                    STATUS_TEXT[status]
                                )}
                            </motion.span>
                        </AnimatePresence>
                    </span>
                </span>
            </Button>
        </div>
    );
});

type PoolButtonProps = PoolTriggerProps & {
    /** What was pooled and has since been put in a slot */
    placedCount: number;
};

// On a phone there is no room in the header, so the same button floats at the corner, as the release board's does
const PoolBubble = memo(function PoolBubble({ count, isEmpty, isOpen, onOpen }: PoolTriggerProps) {
    const ref = useRef<HTMLButtonElement>(null);
    const { setNodeRef, isDragging, isAccepting, isOver } = usePoolDrop("pool-bubble");
    return createPortal(
        <AnimatePresence>
            {!isOpen && (
                <motion.button
                    ref={ref}
                    type="button"
                    disabled={isEmpty && !isDragging}
                    aria-label={`Draft Pool (${count})`}
                    onClick={() => ref.current && onOpen(ref.current.getBoundingClientRect())}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed bottom-6 left-4 z-30 -m-3 p-3 sm:hidden"
                >
                    <div
                        ref={setNodeRef}
                        data-pool-zone
                        className={classNames(
                            "flex size-14 items-center justify-center gap-1 rounded-full border-2 bg-content1 shadow-lg transition-[transform,border-color]",
                            {
                                "opacity-40": (isEmpty && !isDragging) || (isDragging && !isAccepting),
                                "border-content3": !isAccepting,
                                "border-primary": isAccepting,
                                "scale-125 bg-primary/20": isOver
                            }
                        )}
                    >
                        <DraftPoolIcon className="text-foreground/60" />
                        <span className="text-sm font-semibold">{count}</span>
                    </div>
                </motion.button>
            )}
        </AnimatePresence>,
        document.body
    );
});

type PoolTriggerProps = {
    /** What is still in the pool - not yet placed in a slot */
    count: number;
    /** Nothing was ever pooled, so there is nothing to open */
    isEmpty: boolean;
    isOpen: boolean;
    onOpen: (rect: DOMRect) => void;
};

const PoolCard = memo(function PoolCard({ suggestion, project, isInteractive, onRemove, onPlace }: PoolCardProps) {
    const card = useMemo(() => suggestionToPlaytestCard(suggestion, project, POOLED_FROM), [suggestion, project]);
    const isCarried = useDragState((state) => !!suggestion.id && state.active?.suggestion?.id === suggestion.id);
    const { attributes, listeners, setNodeRef } = useDraggable({
        id: `pool-${suggestion.id}`,
        data: { card, slotNumber: POOLED_FROM, suggestion } satisfies DragData,
        // Not while the panel is opening - but a card already in hand is kept as the panel is put away
        disabled: !isInteractive && !isCarried
    });
    return (
        <li
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            onClick={(event) =>
                isInteractive &&
                onPlace({ card, slotNumber: POOLED_FROM, suggestion }, event.currentTarget.getBoundingClientRect())
            }
            className={classNames("group relative cursor-grab touch-manipulation select-none active:cursor-grabbing", {
                "opacity-40": isCarried
            })}
        >
            <SuggestionCardPreview
                suggestion={suggestion}
                orientation={suggestion.card.type === "plot" ? undefined : "vertical"}
                rounded
            />
            <div
                className="absolute right-1.5 top-1.5 opacity-25 transition-opacity hover:opacity-90 group-hover:opacity-90"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
            >
                <Tooltip content="Remove from this pool" color="danger">
                    <Button
                        isIconOnly
                        radius="full"
                        size="sm"
                        variant="faded"
                        aria-label={`Remove ${suggestion.card.name} from this project's pool`}
                        className={classNames(FLAT_BUTTON_CLASS, "text-danger")}
                        onPress={() => suggestion.id && onRemove(suggestion.id)}
                    >
                        <FontAwesomeIcon icon={faXmark} className="text-lg" />
                    </Button>
                </Tooltip>
            </div>
        </li>
    );
});

type PoolCardProps = {
    suggestion: ICardSuggestion;
    project: number;
    isInteractive: boolean;
    onRemove: (suggestion: string) => void;
    onPlace: (data: DragData, from: DOMRect) => void;
};
