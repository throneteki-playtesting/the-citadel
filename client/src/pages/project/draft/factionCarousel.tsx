import { memo } from "react";
import { addToast, Button, Tooltip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { Faction } from "common/models/cards";
import Permission from "common/models/permissions";
import { factionNames } from "common/utils";
import { useCreateSlotMutation, useDeleteSlotMutation } from "../../../api";
import ThronesIcon from "../../../components/thronesIcon";
import Watermark from "../../../components/watermark";
import { usePermission } from "../../../hooks/usePermission";
import { DRAFT_ROW_HEIGHT_CLASS, FLAT_BUTTON_CLASS, watermarkClasses } from "../../../constants";
import FactionSlot, { SlotHandlers } from "./factionSlot";
import { DraftSlot } from "./draftSlots";

const FactionCarousel = memo(function FactionCarousel({
    project,
    faction,
    slots,
    totalSlots,
    isSlotsFetching,
    arrangingNumber,
    isLifted,
    ...handlers
}: FactionCarouselProps) {
    const lastSlot = slots.at(-1);
    return (
        <div className="relative border border-content3 overflow-hidden">
            <FactionHeader
                project={project}
                faction={faction}
                slotCount={slots.length}
                lastSlotNumber={lastSlot?.number}
                isLastSlotEmpty={!lastSlot?.options.length}
                totalSlots={totalSlots}
                isSlotsFetching={isSlotsFetching}
            />
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
    project: number;
    faction: Faction;
    slots: DraftSlot[];
    totalSlots: number;
    isSlotsFetching: boolean;
    arrangingNumber?: number;
    isLifted: boolean;
};

// Apart from the row, so a change to one slot's cards never redraws the faction's title and controls
const FactionHeader = memo(function FactionHeader({
    project,
    faction,
    slotCount,
    lastSlotNumber,
    isLastSlotEmpty,
    totalSlots,
    isSlotsFetching
}: FactionHeaderProps) {
    const canCreateSlots = usePermission(Permission.CREATE_SLOTS);
    const canDeleteSlots = usePermission(Permission.DELETE_SLOTS);

    const [createSlot, { isLoading: isCreatingSlot }] = useCreateSlotMutation();
    const [deleteSlot, { isLoading: isDeletingSlot }] = useDeleteSlotMutation();

    const onAddSlot = async () => {
        try {
            await createSlot({ project, faction }).unwrap();
        } catch {
            addToast({
                title: "Failed to add slot",
                color: "danger",
                description: `Could not add a new ${factionNames[faction]} slot`
            });
        }
    };

    const onRemoveSlot = async () => {
        if (lastSlotNumber === undefined) {
            return;
        }
        try {
            await deleteSlot({ project, number: lastSlotNumber }).unwrap();
        } catch {
            addToast({
                title: "Failed to remove slot",
                color: "danger",
                description: `Could not remove ${factionNames[faction]} slot #${lastSlotNumber}`
            });
        }
    };

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
                <div className="flex items-center gap-1 pr-4">
                    <span className="text-small text-default-500 whitespace-nowrap pr-1">
                        {slotCount}/{totalSlots} {totalSlots === 1 ? "slot" : "slots"}
                    </span>
                    {canDeleteSlots && (
                        <Tooltip
                            content={
                                isLastSlotEmpty
                                    ? `Remove last ${factionNames[faction]} slot`
                                    : "Cannot remove a slot with cards on it"
                            }
                        >
                            <span tabIndex={0} className="inline-block">
                                <Button
                                    isIconOnly
                                    size="sm"
                                    variant="flat"
                                    className={FLAT_BUTTON_CLASS}
                                    isDisabled={!isLastSlotEmpty || isDeletingSlot || isSlotsFetching}
                                    onPress={onRemoveSlot}
                                >
                                    <FontAwesomeIcon icon={faMinus} />
                                </Button>
                            </span>
                        </Tooltip>
                    )}
                    {canCreateSlots && (
                        <Tooltip content={`Add a ${factionNames[faction]} slot`}>
                            <Button
                                isIconOnly
                                size="sm"
                                variant="flat"
                                className={FLAT_BUTTON_CLASS}
                                isLoading={isCreatingSlot}
                                onPress={onAddSlot}
                            >
                                <FontAwesomeIcon icon={faPlus} />
                            </Button>
                        </Tooltip>
                    )}
                </div>
            </div>
        </>
    );
});

type FactionHeaderProps = {
    project: number;
    faction: Faction;
    slotCount: number;
    lastSlotNumber?: number;
    isLastSlotEmpty: boolean;
    totalSlots: number;
    isSlotsFetching: boolean;
};
