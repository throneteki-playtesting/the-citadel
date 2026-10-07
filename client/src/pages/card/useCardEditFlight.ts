import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isEqual } from "lodash-es";
import { IPlaytestCard } from "common/models/cards";
import { SlotCondition, slotConditionIssues } from "common/models/slotConditions";
import { DeepPartial } from "common/types";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { TransitCardProps } from "../project/draft/transitCard";

// The card fading back to how it was, which has to finish before the modal goes
const REVERT_MS = 300;

/** Where a card sat in its stack, so it can be carried from there to its editor */
export type EditOrigin = {
    card: IPlaytestCard;
    rank: number;
    slotNumber: number;
    isUpright: boolean;
    issues: string[];
    from: DOMRect;
    source: HTMLElement;
};

type Flight = Omit<TransitCardProps, "onDone">;

// A card edited from its stack is carried to the editor and back - or, cancelled after changes, shown as it was first
export function useCardEditFlight({
    isOpen,
    initial,
    card,
    origin,
    conditions,
    stackWidth,
    onClose
}: CardEditFlightArgs) {
    const prefersReducedMotion = useReducedMotion();
    const previewRef = useRef<HTMLDivElement>(null);
    const faceRef = useRef<HTMLDivElement>(null);
    const [arrived, setArrived] = useState<EditOrigin>();
    const [returning, setReturning] = useState<Flight>();
    // The card it is being cancelled back to - held through the modal's fade out, so nothing beside it moves as it goes
    const [revertedTo, setRevertedTo] = useState<DeepPartial<IPlaytestCard>>();
    const [previousInitial, setPreviousInitial] = useState(initial);
    if (initial !== previousInitial) {
        setPreviousInitial(initial);
        if (initial) {
            setRevertedTo(undefined);
        }
    }
    const revertTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const referenceWidth = stackWidth ?? (origin && Math.min(origin.from.width, origin.from.height));

    // What the card flying home needs after the modal's own props have cleared away beneath it
    const issues = slotConditionIssues(conditions, card as IPlaytestCard, true);
    const shownIssues = useRef(issues);
    const latest = useRef({ card, origin, arrived, conditions, referenceWidth, original: initial, revertedTo });
    useLayoutEffect(() => {
        if (isOpen) {
            shownIssues.current = issues;
        }
        latest.current = {
            card,
            origin,
            arrived,
            conditions: conditions ?? latest.current.conditions,
            referenceWidth,
            original: initial ?? latest.current.original,
            revertedTo
        };
    });

    // Closed, the card is carried back to where it sat - or, with nowhere to go, simply shown there again
    const wasOpen = useRef(false);
    useLayoutEffect(() => {
        if (isOpen) {
            wasOpen.current = true;
            return;
        }
        if (!wasOpen.current) {
            return;
        }
        wasOpen.current = false;
        const { card: edited, origin: leaving, arrived: arrivedAt, conditions: asked, ...rest } = latest.current;
        const preview = previewRef.current;
        const face = faceRef.current;
        if (!leaving) {
            return;
        }
        if (arrivedAt === leaving && preview && face && leaving.source.isConnected) {
            const closing = (rest.revertedTo ? rest.original : edited) as IPlaytestCard;
            setReturning({
                card: closing,
                rank: leaving.rank,
                isUpright: false,
                issues: slotConditionIssues(asked, closing, true),
                from: face.getBoundingClientRect(),
                fromControl: "none",
                toControl: "menu",
                stackWidth: rest.referenceWidth ?? Math.min(leaving.from.width, leaving.from.height),
                source: preview,
                getTarget: () => (leaving.source.isConnected ? leaving.source : undefined)
            });
        } else {
            leaving.source.style.removeProperty("visibility");
        }
    }, [isOpen]);

    useEffect(() => () => clearTimeout(revertTimer.current), [isOpen]);

    const cancel = () => {
        if (revertedTo) {
            return;
        }
        const hasChanged = !!origin && !prefersReducedMotion && !!initial && !isEqual(card, initial);
        if (!hasChanged) {
            onClose();
            return;
        }
        setRevertedTo(initial);
        revertTimer.current = setTimeout(onClose, REVERT_MS);
    };

    const isFlying = isOpen && !!origin && origin !== arrived && !prefersReducedMotion;
    return {
        previewRef,
        faceRef,
        revertedTo,
        referenceWidth,
        shownIssues: isOpen ? issues : shownIssues.current,
        cancel,
        forward:
            isFlying && origin
                ? {
                      card: origin.card,
                      rank: origin.rank,
                      isUpright: origin.isUpright,
                      issues: origin.issues,
                      from: origin.from,
                      fromControl: "menu" as const,
                      toControl: "none" as const,
                      stackWidth: referenceWidth ?? Math.min(origin.from.width, origin.from.height),
                      source: origin.source,
                      isSourceHeld: true,
                      getTarget: () => previewRef.current,
                      onDone: () => setArrived(origin)
                  }
                : undefined,
        backward: returning && { ...returning, onDone: () => setReturning(undefined) }
    };
}

type CardEditFlightArgs = {
    isOpen: boolean;
    /** The card as it was when the editor opened */
    initial?: DeepPartial<IPlaytestCard>;
    /** The card as it is being edited */
    card: DeepPartial<IPlaytestCard>;
    origin?: EditOrigin;
    conditions?: SlotCondition[];
    stackWidth?: number;
    onClose: () => void;
};
