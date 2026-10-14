import { memo, useMemo, useState } from "react";
import { Button, Tooltip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence, motion } from "framer-motion";
import classNames from "classnames";
import { Faction } from "common/models/cards";
import { factionNames, pluralize } from "common/utils";
import ThronesIcon from "../../../components/thronesIcon";
import Watermark from "../../../components/watermark";
import { FLAT_BUTTON_CLASS, watermarkClasses } from "../../../constants";
import { useGlidingChildren } from "../../../hooks/useGlidingChildren";
import FactionSlot, { SlotHandlers } from "./factionSlot";
import { useDragState } from "./draftDragStore";
import { DraftSlot, firstFittingSlot } from "./draftSlots";
import { SHAPE_KEYFRAME_TIMING } from "./slotShape";
import { toggleFactionExpanded, useIsFactionExpanded } from "./expandedFactionsStore";

// A faction's slots in one scrolling row, or wrapped when expanded - the same slots, so expanding only moves them
const FactionSection = memo(function FactionSection({
    faction,
    slots,
    totalSlots,
    arrangingNumber,
    isLifted,
    ...handlers
}: FactionSectionProps) {
    const isExpanded = useIsFactionExpanded(faction);
    // A card held over the faction is placed in the first slot it fits - and with none, the faction takes no drops
    const active = useDragState((state) => state.active);
    const isFull = useMemo(() => !!active && !firstFittingSlot(slots, active.card, active.slotNumber), [slots, active]);
    const { setNodeRef } = useDroppable({ id: `faction-${faction}`, data: { faction }, disabled: isFull });
    const isTargeted = useDragState((state) => state.overFaction === faction);
    const [slotList, setSlotList] = useState<HTMLDivElement | null>(null);
    useGlidingChildren(slotList, SHAPE_KEYFRAME_TIMING);
    return (
        <div
            ref={setNodeRef}
            className={classNames("relative border overflow-hidden transition-colors duration-200", {
                "border-primary bg-primary/10": isTargeted,
                "border-content3": !isTargeted
            })}
        >
            <FactionHeader faction={faction} slotCount={slots.length} totalSlots={totalSlots} isExpanded={isExpanded} />
            <div
                data-carousel-scroller={isExpanded ? undefined : true}
                className={classNames(
                    "relative p-2",
                    !isExpanded && "overflow-x-auto overflow-y-hidden scroll-smooth [&::-webkit-scrollbar]:hidden"
                )}
            >
                <div
                    ref={setSlotList}
                    data-draft-slots
                    className={classNames("@container relative flex gap-2", {
                        "flex-wrap justify-center": isExpanded
                    })}
                >
                    {slots.map((slot, index) => (
                        <FactionSlot
                            key={slot.number}
                            slot={slot}
                            zIndex={slots.length - index}
                            isArranging={arrangingNumber === slot.number}
                            isLifted={arrangingNumber === slot.number && isLifted}
                            isWrapped={isExpanded}
                            {...handlers}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
});

export default FactionSection;

type FactionSectionProps = SlotHandlers & {
    faction: Faction;
    slots: DraftSlot[];
    totalSlots: number;
    arrangingNumber?: number;
    isLifted: boolean;
};

// Apart from the slots, so a change to one slot's cards never redraws the faction's title
const FactionHeader = memo(function FactionHeader({ faction, slotCount, totalSlots, isExpanded }: FactionHeaderProps) {
    const toggleLabel = `${isExpanded ? "Collapse" : "Expand"} ${factionNames[faction]}`;
    // The slot a card held over the faction would go into
    const target = useDragState((state) => (state.overFaction === faction ? state.over : undefined));
    return (
        <>
            <Watermark
                position="top-right"
                icon={
                    <ThronesIcon
                        name={faction}
                        className={classNames("-mt-8 mr-48 text-[8rem] sm:text-[10rem]", watermarkClasses[faction])}
                    />
                }
            />
            <div className="relative flex h-20 flex-col justify-center sm:flex-row sm:items-center sm:gap-2 sm:px-4">
                <div className="px-4 pt-1 font-cinzel text-2xl tracking-widest sm:p-0 sm:text-3xl">
                    {factionNames[faction]}
                </div>
                <div className="flex items-center justify-between gap-2 px-4 pb-1 sm:contents">
                    <AnimatePresence>
                        {target !== undefined && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="font-sans text-sm tracking-normal text-primary"
                            >
                                Place in slot #{target}
                            </motion.span>
                        )}
                    </AnimatePresence>
                    <span className="ml-auto whitespace-nowrap text-small text-default-500">
                        {slotCount}/{totalSlots} {pluralize(totalSlots, "slot")}
                    </span>
                    <Tooltip content={isExpanded ? "Collapse" : "Expand"}>
                        <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            aria-label={toggleLabel}
                            aria-expanded={isExpanded}
                            className={FLAT_BUTTON_CLASS}
                            onPress={() => toggleFactionExpanded(faction)}
                        >
                            <FontAwesomeIcon
                                icon={faChevronDown}
                                className={classNames("transition-transform duration-200", {
                                    "rotate-180": isExpanded
                                })}
                            />
                        </Button>
                    </Tooltip>
                </div>
            </div>
        </>
    );
});

type FactionHeaderProps = {
    faction: Faction;
    slotCount: number;
    totalSlots: number;
    isExpanded: boolean;
};
