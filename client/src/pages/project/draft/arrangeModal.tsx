import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { animate } from "framer-motion";
import classNames from "classnames";
import { CardPreview } from "@agot/card-preview";
import { IPlaytestCard } from "common/models/cards";
import { SemanticVersion } from "common/utils";
import { useUpdateSlotPreferencesMutation } from "../../../api";
import { useSlotTitle } from "../../../components/slots/slotTitle";
import { showApiErrorToast } from "../../../api/errors";
import { useReducedMotion } from "../../../hooks/useReducedMotion";
import { useStableCallback } from "../../../hooks/useStableCallback";
import { slotConditionIssues } from "common/models/slotConditions";
import { DraftCardBadges } from "./draftCardContent";
import { ControlMorph } from "./flyingCard";
import { DraftSlot, isUprightPlot, renderDraftCard } from "./draftSlots";
import { FLIGHT, LIT, pileCardPose, towardsPile } from "./pilePose";
import SortableCardGrid, { SortableCard } from "./sortableCardGrid";

const STAGGER_S = 0.04;
const FADE = { duration: 0.2 } as const;
// The modal's own parts fade by class, in step with FADE
const FADE_CLASS = "transition-opacity duration-200";

// The pile lifted off the table to be put in order, then laid back down - drawn here while its originals hide
export default function ArrangeModal({ project, slot, pile, onLifted, onClosed }: ArrangeModalProps) {
    const title = useSlotTitle(project, slot.number, "Arrange Preferences");
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
                <ModalHeader className={fadeClass}>{title}</ModalHeader>
                <ModalBody className="overflow-visible">
                    <span className={classNames("text-sm text-foreground/60", fadeClass)}>
                        Drag the cards into order of preference. The first is the slot's Favoured.
                    </span>
                    <ArrangeOptions
                        project={project}
                        slot={slot}
                        cardWidth={cardWidth}
                        isShown={isShown}
                        isClosing={isClosing}
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

function ArrangeOptions({ project, slot, cardWidth, isShown, isClosing, flightNodes }: ArrangeOptionsProps) {
    const [updatePreferences] = useUpdateSlotPreferencesMutation();

    // Held locally and moved the moment a card drops, so it lands where it was let go rather than where it was
    const saved = slot.options.map((card) => card.version);
    const [order, setOrder] = useState(saved);
    const [lastSaved, setLastSaved] = useState(saved.join());
    if (saved.join() !== lastSaved) {
        setLastSaved(saved.join());
        setOrder(saved);
    }

    const hasNonPlot = slot.options.some((card) => card.type !== "plot");
    const cards = useMemo(
        () =>
            order.flatMap((version) => {
                const card = slot.options.find((option) => option.version === version);
                return card ? [{ id: version, card }] : [];
            }),
        [order, slot.options]
    );

    const onReorder = useStableCallback(async (ids: string[]) => {
        const next = ids as SemanticVersion[];
        setOrder(next);
        try {
            await updatePreferences({ project, number: slot.number, preferences: next }).unwrap();
        } catch (err) {
            setOrder(saved);
            showApiErrorToast(err, { title: "Failed to rearrange options" });
        }
    });
    const renderCard = useCallback(
        ({ card }: SortableCard, rank: number, isOverlay: boolean) => (
            <OptionCard
                card={card}
                rank={rank}
                hasNonPlot={hasNonPlot}
                issues={slotConditionIssues(slot.slot.conditions, card)}
                isClosing={isClosing}
                isOverlay={isOverlay}
            />
        ),
        [hasNonPlot, slot.slot.conditions, isClosing]
    );

    return (
        <SortableCardGrid
            cards={cards}
            cardWidth={cardWidth}
            hasNonPlot={hasNonPlot}
            isShown={isShown}
            flightNodes={flightNodes}
            renderCard={renderCard}
            onReorder={onReorder}
        />
    );
}

// The stack's menu is on the card as it leaves the pile, fading as the cards lift and returning as they are laid back
function OptionCard({ card, rank, hasNonPlot, issues, isClosing, isOverlay }: OptionCardProps) {
    return (
        <>
            <div className="pointer-events-none absolute inset-0 z-10">
                <DraftCardBadges
                    issues={issues}
                    actions={[]}
                    trailing={
                        isOverlay ? undefined : (
                            <ControlMorph
                                from="menu"
                                to="none"
                                isMorphing={!isClosing}
                                transition={
                                    isClosing
                                        ? { ...FLIGHT, delay: FADE.duration }
                                        : { ...FLIGHT, delay: rank * STAGGER_S }
                                }
                            />
                        )
                    }
                />
            </div>
            <CardPreview
                orientation={isUprightPlot(card, hasNonPlot) ? "vertical" : undefined}
                card={renderDraftCard(card, rank, card.number)}
            />
        </>
    );
}

type OptionCardProps = {
    card: IPlaytestCard;
    rank: number;
    hasNonPlot: boolean;
    issues: string[];
    isClosing: boolean;
    /** Lifted by the cursor, by which time the menu has already gone */
    isOverlay: boolean;
};

type ArrangedSlot = Pick<DraftSlot, "number" | "faction" | "options" | "slot">;

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
    /** The cards are being laid back on the pile */
    isClosing: boolean;
    flightNodes: Map<string, HTMLElement>;
};
