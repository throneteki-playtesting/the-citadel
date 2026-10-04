import { memo } from "react";
import classNames from "classnames";
import { Faction } from "common/models/cards";
import { factionNames, pluralize } from "common/utils";
import ThronesIcon from "../../../components/thronesIcon";
import Watermark from "../../../components/watermark";
import { DRAFT_ROW_HEIGHT_CLASS, watermarkClasses } from "../../../constants";
import FactionSlot, { SlotHandlers } from "./factionSlot";
import { DraftSlot } from "./draftSlots";

const FactionCarousel = memo(function FactionCarousel({
    faction,
    slots,
    totalSlots,
    arrangingNumber,
    isLifted,
    ...handlers
}: FactionCarouselProps) {
    return (
        <div className="relative border border-content3 overflow-hidden">
            <FactionHeader faction={faction} slotCount={slots.length} totalSlots={totalSlots} />
            <div className="relative">
                <div
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
