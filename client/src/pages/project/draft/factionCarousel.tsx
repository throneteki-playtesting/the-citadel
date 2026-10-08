import { memo, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence, motion } from "framer-motion";
import classNames from "classnames";
import { Faction } from "common/models/cards";
import { factionNames, pluralize } from "common/utils";
import ThronesIcon from "../../../components/thronesIcon";
import Watermark from "../../../components/watermark";
import { DRAFT_ROW_HEIGHT_CLASS, watermarkClasses } from "../../../constants";
import FactionSlot, { SlotHandlers } from "./factionSlot";
import { useDragState } from "./draftDragStore";
import { DraftSlot, firstFittingSlot } from "./draftSlots";

const FactionCarousel = memo(function FactionCarousel({
    faction,
    slots,
    totalSlots,
    arrangingNumber,
    isLifted,
    ...handlers
}: FactionCarouselProps) {
    // A card held over the faction is placed in the first slot it fits - and with none, the faction takes no drops
    const active = useDragState((state) => state.active);
    const isFull = useMemo(() => !!active && !firstFittingSlot(slots, active.card, active.slotNumber), [slots, active]);
    const { setNodeRef } = useDroppable({ id: `faction-${faction}`, data: { faction }, disabled: isFull });
    const isTargeted = useDragState((state) => state.overFaction === faction);
    return (
        <div
            ref={setNodeRef}
            className={classNames("relative border overflow-hidden transition-colors duration-200", {
                "border-primary bg-primary/10": isTargeted,
                "border-content3": !isTargeted
            })}
        >
            <FactionHeader faction={faction} slotCount={slots.length} totalSlots={totalSlots} />
            <div className="relative">
                <div
                    data-carousel-scroller
                    className={classNames(
                        "w-full flex overflow-x-auto overflow-y-hidden scroll-smooth snap-x snap-mandatory [&::-webkit-scrollbar]:hidden gap-2 p-2",
                        DRAFT_ROW_HEIGHT_CLASS
                    )}
                >
                    {slots.map((slot, index) => (
                        <FactionSlot
                            key={slot.number}
                            slot={slot}
                            zIndex={slots.length - index}
                            isArranging={arrangingNumber === slot.number}
                            isLifted={arrangingNumber === slot.number && isLifted}
                            {...handlers}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
});

export default FactionCarousel;

type FactionCarouselProps = SlotHandlers & {
    faction: Faction;
    slots: DraftSlot[];
    totalSlots: number;
    arrangingNumber?: number;
    isLifted: boolean;
};

// Apart from the row, so a change to one slot's cards never redraws the faction's title
const FactionHeader = memo(function FactionHeader({ faction, slotCount, totalSlots }: FactionHeaderProps) {
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
            <div className="relative flex h-20 items-center">
                <div className="text-2xl sm:text-3xl font-cinzel tracking-widest p-4 flex items-center gap-2 grow">
                    {factionNames[faction]}
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
                </div>
                <span className="text-small text-default-500 whitespace-nowrap pr-4">
                    {slotCount}/{totalSlots} {pluralize(totalSlots, "slot")}
                </span>
            </div>
        </>
    );
});

type FactionHeaderProps = {
    faction: Faction;
    slotCount: number;
    totalSlots: number;
};
