import { ReactNode } from "react";
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
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCircleExclamation,
    faEllipsis,
    faEye,
    faStar,
    faTriangleExclamation
} from "@fortawesome/free-solid-svg-icons";
import CardCornerBadges, { CornerBadge } from "../cardCornerBadges";
import { CORNER_CONTROL_CLASS, FLAT_BUTTON_CLASS, SLOT_STRAY_TITLE } from "../../constants";
import type { SlotAction } from "./slotFrame";

export type CardAction = SlotAction & {
    className?: string;
    /** Actions of one group sit together in the menu, set apart from the next */
    group?: string;
};

type SlotCardBadgesProps = {
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
    /** The name an important slot's card had before this edit renamed it */
    renamedFrom?: string;
};

// The alert first, then the card's menu - faint until hovered, so the alert is what catches the eye
export function SlotCardBadges({
    issues,
    actions,
    hasProblem = false,
    isButton = false,
    isLive = false,
    trailing,
    reveal,
    renamedFrom
}: SlotCardBadgesProps) {
    if (issues.length === 0 && actions.length === 0 && !hasProblem && !trailing && !isLive && !reveal && !renamedFrom) {
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
                    <FoldingBadge isShown={!!renamedFrom}>
                        <CornerBadge
                            icon={faStar}
                            color="warning"
                            pulse
                            title="Important Card Renamed"
                            description={`This card's name holds through development, barring approval - it was "${renamedFrom}".`}
                        />
                    </FoldingBadge>
                    <FoldingBadge isShown={issues.length > 0}>
                        <CornerBadge
                            icon={faTriangleExclamation}
                            color="warning"
                            pulse
                            title={SLOT_STRAY_TITLE}
                            description={<StrayIssueList issues={issues} />}
                        />
                    </FoldingBadge>
                    {trailing ?? <CardActionsControl actions={actions} isButton={isButton} />}
                </>
            }
        />
    );
}

// A badge which opens into the row as it arrives, so those beside it glide aside
function FoldingBadge({ isShown, children }: { isShown: boolean; children: ReactNode }) {
    return (
        <AnimatePresence initial={false}>
            {isShown && (
                <motion.div
                    key="badge"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    {children}
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export function StrayIssueList({ issues }: { issues: string[] }) {
    return (
        <div className="flex flex-col gap-1 pt-0.5">
            <span className="text-foreground/70">The maesters advise heeding this slot's conditions:</span>
            <ul className="list-disc pl-4">
                {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                ))}
            </ul>
        </div>
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
                        className={classNames(FLAT_BUTTON_CLASS, CORNER_CONTROL_CLASS)}
                        onPress={actions[0].onPress}
                    >
                        <FontAwesomeIcon icon={actions[0].icon} />
                    </Button>
                </Tooltip>
            ) : (
                <Dropdown>
                    <DropdownTrigger>
                        <Button
                            isIconOnly
                            radius="full"
                            size="sm"
                            variant="faded"
                            className={classNames(FLAT_BUTTON_CLASS, CORNER_CONTROL_CLASS)}
                        >
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
