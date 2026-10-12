import { ComponentProps, memo, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import classNames from "classnames";
import {
    Button,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownSection,
    DropdownTrigger,
    Spinner,
    Tooltip
} from "@heroui/react";
import { CardPreview } from "@agot/card-preview";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation, faEllipsis, faEye, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { IPlaytestCard } from "common/models/cards";
import { SlotCondition, slotConditionIssues } from "common/models/slotConditions";
import CardCornerBadges, { CornerBadge } from "../../../components/cardCornerBadges";
import Crossfade from "../../../components/crossfade";
import { FLAT_BUTTON_CLASS } from "../../../constants";
import { useReducedMotion } from "../../../hooks/useReducedMotion";
import { CardAction, CardHandlers, useCardActions } from "./useCardActions";
import { renderDraftCard } from "./draftSlots";
import { renderPlaytestingCard } from "common/utils";
import { QUARTER_TURN, SHAPE_TRANSITION, SIZE_TRANSITION_CLASS, plotShape } from "./slotShape";

// Memoised, so a slot redrawing for a drag only redraws the cards whose rank it changes
const DraftCardContent = memo(function DraftCardContent({
    card,
    rank,
    slotNumber,
    conditions,
    isUpright,
    isRevealed,
    isGhost,
    isCovered,
    extraActions,
    onEdit,
    onDelete
}: DraftCardContentProps) {
    const ownActions = useCardActions({ onEdit, onDelete })(card);
    const actions = extraActions ? [...extraActions, ...ownActions] : ownActions;
    const face = isGhost ? renderGhostFace(card, slotNumber) : renderDraftCard(card, rank, slotNumber);
    const reveal = isGhost ? (isCovered ? "current" : "removed") : isRevealed ? "current" : undefined;
    return (
        <div className="size-full relative">
            <DraftCardBadges
                issues={isGhost ? [] : slotConditionIssues(conditions, card)}
                actions={isGhost ? [] : actions}
                reveal={reveal}
            />
            <motion.div
                className="size-full"
                initial={false}
                animate={
                    isGhost
                        ? { opacity: 1, filter: "grayscale(1) brightness(0.45)" }
                        : { opacity: 1, filter: "grayscale(0) brightness(1)" }
                }
                transition={{ duration: 0.5 }}
            >
                {card.type === "plot" ? (
                    <PlotFace card={face} isUpright={isUpright} />
                ) : (
                    <div className="relative h-full flex justify-center items-center">
                        <div className="relative w-full">
                            <Crossfade contentKey={`${String(card.updated)}|${rank}`}>
                                <CardPreview className="select-none" card={face} />
                            </Crossfade>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
});

function renderGhostFace(card: IPlaytestCard, slotNumber: number) {
    return renderPlaytestingCard(card, {
        top: "Removed Card",
        middle: `Card #${slotNumber}`,
        bottom: "Still Revealed"
    });
}

export default DraftCardContent;

// A plot is drawn on its side and stood upright by turning it, so a slot gaining a card which isn't a plot turns the
// plots in it rather than swapping them
function PlotFace({ card, isUpright }: PlotFaceProps) {
    const prefersReducedMotion = useReducedMotion();
    return (
        <div className="relative size-full">
            <motion.div
                initial={false}
                animate={{ rotate: isUpright ? -QUARTER_TURN : 0 }}
                transition={prefersReducedMotion ? { duration: 0 } : SHAPE_TRANSITION}
                className={classNames(
                    "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
                    SIZE_TRANSITION_CLASS
                )}
                style={plotShape(isUpright)}
            >
                <CardPreview className="size-full select-none" orientation="horizontal" card={card} />
            </motion.div>
        </div>
    );
}

type PlotFaceProps = {
    card: ComponentProps<typeof CardPreview>["card"];
    isUpright: boolean;
};

type DraftCardContentProps = CardHandlers & {
    card: IPlaytestCard;
    rank: number;
    slotNumber: number;
    conditions?: SlotCondition[];
    isUpright: boolean;
    /** It is the card its slot has revealed to the design team */
    isRevealed?: boolean;
    /** It has been removed from its slot, but is still what the slot has revealed */
    isGhost?: boolean;
    /** The card it stands behind is still in its slot, so it is the revealed card, not a removed one */
    isCovered?: boolean;
    /** What else can be done with this card, beside editing and deleting it */
    extraActions?: CardAction[];
};

type DraftCardBadgesProps = {
    issues: string[];
    actions: CardAction[];
    /** The card can't be saved as it is - shown ahead of any slot warning */
    hasProblem?: boolean;
    /** The first action is a button of its own, rather than the menu of them all */
    isButton?: boolean;
    /** Stays mounted with nothing to show, so a warning arriving or clearing as the card is edited can fade */
    isLive?: boolean;
    /** Stands in for the actions' own control */
    trailing?: ReactNode;
    /** Which card the slot has revealed - the one it still holds, or one which has since been removed */
    reveal?: "current" | "removed";
};

// The alert first, then the card's menu - faint until hovered, so the alert is what catches the eye
export function DraftCardBadges({
    issues,
    actions,
    hasProblem = false,
    isButton = false,
    isLive = false,
    trailing,
    reveal
}: DraftCardBadgesProps) {
    if (issues.length === 0 && actions.length === 0 && !hasProblem && !trailing && !isLive && !reveal) {
        return null;
    }
    return (
        <CardCornerBadges
            isolateClicks
            badges={[]}
            leading={
                <>
                    {hasProblem && (
                        <CornerBadge
                            icon={faCircleExclamation}
                            color="danger"
                            title="Needs Attention"
                            description="Edit this card to fix what it is missing."
                        />
                    )}
                    <AnimatePresence initial={false}>
                        {reveal && (
                            <motion.div
                                key="reveal"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <RevealBadge isRemoved={reveal === "removed"} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <AnimatePresence initial={false}>
                        {issues.length > 0 && (
                            <motion.div
                                key="issues"
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: "auto" }}
                                exit={{ opacity: 0, width: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <CornerBadge
                                    icon={faTriangleExclamation}
                                    color="warning"
                                    pulse
                                    title="Doesn't Fit Its Slot"
                                    description={
                                        <div className="flex flex-col gap-1 pt-0.5">
                                            <span className="text-foreground/70">
                                                The maesters advise heeding this slot's conditions:
                                            </span>
                                            <ul className="list-disc pl-4">
                                                {issues.map((issue) => (
                                                    <li key={issue}>{issue}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    }
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {trailing ?? <CardActionsControl actions={actions} isButton={isButton} />}
                </>
            }
        />
    );
}

function RevealBadge({ isRemoved }: { isRemoved: boolean }) {
    return (
        <CornerBadge
            icon={faEye}
            title="Revealed Card"
            description={isRemoved ? "Removed since, but still the one shown." : "The card shown to the design team."}
        />
    );
}

// Faint until hovered - a menu of every action, or a button for the first alone
export function CardActionsControl({ actions, isButton = false }: { actions: CardAction[]; isButton?: boolean }) {
    if (actions.length === 0) {
        return null;
    }
    const sections = actions.reduce<CardAction[][]>((groups, action) => {
        const last = groups.at(-1);
        if (last && last[0].group === action.group) {
            last.push(action);
        } else {
            groups.push([action]);
        }
        return groups;
    }, []);
    return (
        <div className="opacity-25 hover:opacity-90 transition-opacity">
            {isButton ? (
                <Tooltip content={actions[0].label}>
                    <Button
                        isIconOnly
                        radius="full"
                        size="sm"
                        variant="faded"
                        aria-label={actions[0].label}
                        className={FLAT_BUTTON_CLASS}
                        onPress={actions[0].onPress}
                    >
                        <FontAwesomeIcon icon={actions[0].icon} />
                    </Button>
                </Tooltip>
            ) : (
                <Dropdown>
                    <DropdownTrigger>
                        <Button isIconOnly radius="full" size="sm" variant="faded" className={FLAT_BUTTON_CLASS}>
                            <FontAwesomeIcon icon={faEllipsis} />
                        </Button>
                    </DropdownTrigger>
                    <DropdownMenu aria-label="Card actions">
                        {sections.map((section, index) => (
                            <DropdownSection key={section[0].key} showDivider={index < sections.length - 1}>
                                {section.map((action) => (
                                    <DropdownItem
                                        key={action.key}
                                        className={action.className}
                                        startContent={
                                            action.isBusy ? (
                                                <Spinner size="sm" classNames={{ wrapper: "size-4" }} />
                                            ) : (
                                                <FontAwesomeIcon icon={action.icon} fixedWidth />
                                            )
                                        }
                                        onPress={action.onPress}
                                    >
                                        {action.label}
                                    </DropdownItem>
                                ))}
                            </DropdownSection>
                        ))}
                    </DropdownMenu>
                </Dropdown>
            )}
        </div>
    );
}
