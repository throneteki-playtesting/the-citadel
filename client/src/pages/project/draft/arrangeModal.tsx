import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { animate, motion } from "framer-motion";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import classNames from "classnames";
import { CardPreview } from "@agot/card-preview";
import { IPlaytestCard } from "common/models/cards";
import { preferenceLabel } from "common/models/slots";
import { factionNames, SemanticVersion } from "common/utils";
import { useUpdateSlotPreferencesMutation } from "../../../api";
import { showApiErrorToast } from "../../../api/errors";
import ThronesIcon from "../../../components/thronesIcon";
import { useReducedMotion } from "../../../hooks/useReducedMotion";
import { useDragSensors } from "../../../hooks/useDragSensors";
import { CARD_BASE, EASE_STANDARD } from "../../../constants";
import { DraftSlot, isUprightPlot, renderDraftCard } from "./draftSlots";
import { dropAnimation } from "../releases/releaseDnd";

const FLIGHT = { duration: 0.45, ease: EASE_STANDARD } as const;
const STAGGER_S = 0.04;
const FADE = { duration: 0.2 } as const;
// The modal's own parts fade by class, in step with FADE
const FADE_CLASS = "transition-opacity duration-200";
const LIT = "brightness(1)";

type Pose = { cx: number; cy: number; width: number; rotate: number; filter: string; zIndex: string };

// Where a card rests in its pile, read off the stack itself - box, offset and tilt, shading, and what it lies under
function pileCardPose(pile: HTMLElement, stackIndex: number): Pose {
    const box = pile.getBoundingClientRect();
    const card = pile.querySelector<HTMLElement>(`[data-stack-index="${stackIndex}"]`);
    const style = card ? getComputedStyle(card) : undefined;
    const matrix = new DOMMatrix(style?.transform ?? "none");
    return {
        cx: box.left + box.width / 2 + matrix.e,
        cy: box.top + box.height / 2 + matrix.f,
        width: box.width,
        rotate: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI,
        filter: style && style.filter !== "none" ? style.filter : LIT,
        zIndex: card?.style.zIndex ?? ""
    };
}

function towardsPile(rect: DOMRect, pose: Pose) {
    return {
        x: pose.cx - (rect.left + rect.width / 2),
        y: pose.cy - (rect.top + rect.height / 2),
        scale: pose.width / rect.width,
        rotate: pose.rotate,
        filter: pose.filter
    };
}

// The pile lifted off the table to be put in order, then laid back down - drawn here while its originals hide
export default function ArrangeModal({ project, slot, pile, onLifted, onClosed }: ArrangeModalProps) {
    const [isSettled, setIsSettled] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [cardWidth] = useState(() => pile.getBoundingClientRect().width);
    const flightNodes = useRef(new Map<string, HTMLElement>());
    const hasLifted = useRef(false);
    const prefersReducedMotion = useReducedMotion();

    // The stack draws its options oldest-first, so the Favoured is its last index
    const stackIndexOf = (version: string) =>
        slot.options.length - 1 - slot.options.findIndex((card) => card.version === version);
    const rankOf = (version: string) => slot.options.findIndex((card) => card.version === version);

    // Set before the first paint, so each card starts exactly where and how it lay rather than flashing in place
    const flyFrom = (node: HTMLElement, version: string) => {
        if (prefersReducedMotion) {
            return animate(node, { opacity: [0, 1] }, FADE);
        }
        const pose = pileCardPose(pile, stackIndexOf(version));
        const from = towardsPile(node.getBoundingClientRect(), pose);
        // Lifted in the order it lay, so the card on view stays on top until the cards part
        node.style.zIndex = pose.zIndex;
        node.style.transform = [
            `translateX(${from.x}px)`,
            `translateY(${from.y}px)`,
            `scale(${from.scale})`,
            `rotate(${from.rotate}deg)`
        ].join(" ");
        node.style.filter = from.filter;
        const flight = animate(
            node,
            {
                x: [from.x, 0],
                y: [from.y, 0],
                scale: [from.scale, 1],
                rotate: [from.rotate, 0],
                filter: [from.filter, LIT]
            },
            { ...FLIGHT, delay: rankOf(version) * STAGGER_S }
        );
        return flight.then(() => node.style.removeProperty("z-index"));
    };

    useLayoutEffect(() => {
        if (hasLifted.current) {
            return;
        }
        hasLifted.current = true;
        const flights = [...flightNodes.current].map(([version, node]) => flyFrom(node, version));
        onLifted();
        void Promise.all(flights).then(() => setIsSettled(true));
    });

    // The modal goes first and the cards follow, the reverse of how they arrived
    const gather = async () => {
        if (isClosing || !isSettled) {
            return;
        }
        setIsClosing(true);
        await new Promise((resolve) => setTimeout(resolve, FADE.duration * 1000));
        await Promise.all(
            [...flightNodes.current].map(([version, node]) => {
                if (prefersReducedMotion) {
                    return animate(node, { opacity: 0 }, FADE);
                }
                const to = towardsPile(node.getBoundingClientRect(), pileCardPose(pile, stackIndexOf(version)));
                // Laid back down Favoured last, so it settles on top of the pile
                node.style.zIndex = String(slot.options.length - rankOf(version));
                return animate(node, to, FLIGHT);
            })
        );
        onClosed();
    };

    // Shown only once the cards have landed, and gone again before they leave
    const isShown = isSettled && !isClosing;
    const fadeClass = classNames(FADE_CLASS, isShown ? "opacity-100" : "opacity-0");

    return (
        <Modal
            isOpen
            size="5xl"
            disableAnimation
            isDismissable={isSettled}
            isKeyboardDismissDisabled={!isSettled}
            onClose={gather}
            classNames={{
                wrapper: "items-start sm:items-start overflow-y-auto",
                base: classNames(
                    "my-auto sm:my-auto w-fit overflow-visible transition-[background-color,box-shadow] duration-200",
                    {
                        "bg-transparent shadow-none": !isShown
                    }
                ),
                backdrop: fadeClass,
                closeButton: fadeClass
            }}
        >
            <ModalContent>
                <ModalHeader className={classNames("flex items-center gap-2", fadeClass)}>
                    <ThronesIcon name={slot.faction} />
                    Arrange #{slot.number} {factionNames[slot.faction]} slot
                </ModalHeader>
                <ModalBody className="overflow-visible">
                    <span className={classNames("text-sm text-foreground/60", fadeClass)}>
                        Drag the cards into order of preference. The first is the slot's Favoured.
                    </span>
                    <ArrangeOptions
                        project={project}
                        slot={slot}
                        cardWidth={cardWidth}
                        isShown={isShown}
                        flightNodes={flightNodes.current}
                    />
                </ModalBody>
                <ModalFooter className={fadeClass}>
                    <Button color="primary" onPress={gather}>
                        Done
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

function ArrangeOptions({ project, slot, cardWidth, isShown, flightNodes }: ArrangeOptionsProps) {
    const [updatePreferences] = useUpdateSlotPreferencesMutation();
    const [activeVersion, setActiveVersion] = useState<SemanticVersion>();
    const [overVersion, setOverVersion] = useState<SemanticVersion>();
    const sensors = useDragSensors();

    // Held locally and moved the moment a card drops, so it lands where it was let go rather than where it was
    const saved = slot.options.map((card) => card.version);
    const [order, setOrder] = useState(saved);
    const [lastSaved, setLastSaved] = useState(saved.join());
    if (saved.join() !== lastSaved) {
        setLastSaved(saved.join());
        setOrder(saved);
    }

    // Where every card would sit if dropped now - so each rank reads as it would, while still being dragged
    const projected =
        activeVersion && overVersion
            ? arrayMove(order, order.indexOf(activeVersion), order.indexOf(overVersion))
            : order;
    const cardOf = (version: string) => slot.options.find((card) => card.version === version);
    const hasNonPlot = slot.options.some((card) => card.type !== "plot");
    const active = activeVersion ? cardOf(activeVersion) : undefined;

    const endDrag = () => {
        setActiveVersion(undefined);
        setOverVersion(undefined);
    };

    const onDragEnd = async () => {
        const next = projected;
        endDrag();
        if (next.join() === order.join()) {
            return;
        }
        setOrder(next);
        try {
            await updatePreferences({ project, number: slot.number, preferences: next }).unwrap();
        } catch (err) {
            setOrder(saved);
            showApiErrorToast(err, { title: "Failed to rearrange options" });
        }
    };

    return (
        <DndContext
            sensors={sensors}
            onDragStart={({ active }) => setActiveVersion(active.id as SemanticVersion)}
            onDragOver={({ over }) => setOverVersion(over?.id as SemanticVersion | undefined)}
            onDragEnd={onDragEnd}
            onDragCancel={endDrag}
        >
            <SortableContext items={order} strategy={rectSortingStrategy}>
                <div className="relative flex flex-wrap justify-center gap-4">
                    {order.flatMap((version) => {
                        const card = cardOf(version);
                        return card
                            ? [
                                  <SortableOption
                                      key={version}
                                      card={card}
                                      rank={projected.indexOf(version)}
                                      hasNonPlot={hasNonPlot}
                                      cardWidth={cardWidth}
                                      isShown={isShown}
                                      flightRef={(node) => {
                                          if (node) {
                                              flightNodes.set(version, node);
                                          } else {
                                              flightNodes.delete(version);
                                          }
                                      }}
                                  />
                              ]
                            : [];
                    })}
                </div>
            </SortableContext>
            {createPortal(
                <DragOverlay dropAnimation={dropAnimation}>
                    {active && (
                        <div className="flex cursor-grabbing flex-col gap-1" style={{ width: cardWidth }}>
                            <RankLabel rank={projected.indexOf(active.version)} />
                            <OptionCard
                                card={active}
                                rank={projected.indexOf(active.version)}
                                hasNonPlot={hasNonPlot}
                            />
                        </div>
                    )}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
}

// The card face's corner, scaled from its base size to the width it is drawn at
function cornerRadius(width: number, isLandscape: boolean) {
    return (CARD_BASE.cornerRadius * width) / (isLandscape ? CARD_BASE.height : CARD_BASE.width);
}

// Its cell holds still while the card in it moves, so the outline beneath marks a place a card can go
function SortableOption({ card, rank, hasNonPlot, cardWidth, isShown, flightRef }: SortableOptionProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: card.version,
        disabled: !isShown
    });
    return (
        <div className="relative" style={{ width: cardWidth }}>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: isShown ? 1 : 0 }}
                transition={FADE}
                className="absolute inset-x-0 bottom-0 top-5 border-2 border-dashed border-foreground/20"
                style={{ borderRadius: cornerRadius(cardWidth, card.type === "plot" && !hasNonPlot) }}
            />
            <div
                ref={setNodeRef}
                {...attributes}
                {...listeners}
                style={{ transform: CSS.Transform.toString(transform), transition }}
                className={classNames("relative flex flex-col gap-1 touch-manipulation select-none", {
                    "cursor-grab": isShown,
                    "opacity-0": isDragging
                })}
            >
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: isShown ? 1 : 0 }} transition={FADE}>
                    <RankLabel rank={rank} />
                </motion.div>
                <div ref={flightRef} className="relative">
                    <OptionCard card={card} rank={rank} hasNonPlot={hasNonPlot} />
                </div>
            </div>
        </div>
    );
}

function RankLabel({ rank }: { rank: number }) {
    return (
        <span
            className={classNames(
                "block font-cinzel text-xs uppercase tracking-wide",
                rank === 0 ? "text-primary" : "text-foreground/60"
            )}
        >
            {preferenceLabel(rank)}
        </span>
    );
}

function OptionCard({ card, rank, hasNonPlot }: { card: IPlaytestCard; rank: number; hasNonPlot: boolean }) {
    return (
        <CardPreview
            orientation={isUprightPlot(card, hasNonPlot) ? "vertical" : undefined}
            card={renderDraftCard(card, rank, card.number)}
        />
    );
}

type ArrangedSlot = Pick<DraftSlot, "number" | "faction" | "options">;

type ArrangeModalProps = {
    project: number;
    slot: ArrangedSlot;
    /** The pile on the table the cards are lifted from, and laid back down on */
    pile: HTMLElement;
    /** Once every card has left the pile, so the pile can be put back in order unseen */
    onLifted: () => void;
    /** Once the cards are back down, so the pile can show itself again */
    onClosed: () => void;
};

type ArrangeOptionsProps = {
    project: number;
    slot: ArrangedSlot;
    cardWidth: number;
    /** The modal around the cards is on show - not while they fly in or out, when nothing can be dragged */
    isShown: boolean;
    flightNodes: Map<string, HTMLElement>;
};

type SortableOptionProps = {
    card: IPlaytestCard;
    rank: number;
    hasNonPlot: boolean;
    cardWidth: number;
    isShown: boolean;
    flightRef: (node: HTMLDivElement | null) => void;
};
