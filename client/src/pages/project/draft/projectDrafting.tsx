import { factionNames, parseCardCode, renderPlaytestingCard, thronesColors } from "common/utils";
import { useEffect, useMemo, useState } from "react";
import { IProject } from "common/models/projects";
import { Faction, factions, IPlaytestCard } from "common/models/cards";
import { DeepPartial } from "common/types";
import EditCardModal from "../../card/editCardModal";
import DeleteCardModal from "../../card/deleteCardModal";
import SelectSuggestionModal from "./selectSuggestionModal";
import { addToast, Button, Dropdown, DropdownItem, DropdownMenu, DropdownSection, DropdownTrigger, Skeleton, Tooltip } from "@heroui/react";
import { useGetCardsQuery } from "../../../api";
import classNames from "classnames";
import ThronesIcon from "../../../components/thronesIcon";
import CardStack from "../../../components/cardStack";
import { CardBlank, CardPreview } from "@agot/card-preview";
import { faAddressCard, faEllipsis, faPencil, faStarOfLife, faTrash, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Permission from "common/models/permissions";
import PermissionGate from "../../../components/permissionGate";
import { groupBy } from "lodash-es";
import RadialMenu from "../../../components/radialMenu";
import { watermarkClasses } from "../../../constants";
import { BaseElementProps } from "../../../types";
import { usePermission } from "../../../hooks/usePermission";

type DraftSlot = {
    faction: Faction;
    number: number;
    options: IPlaytestCard[];
    totalSlots: number;
}

export default function ProjectDrafting({ project }: ProjectDraftingProps) {
    const { data: cardsData, isLoading } = useGetCardsQuery({ filter: { project: project.number, draft: true } });

    const [editing, setEditing] = useState<DeepPartial<IPlaytestCard>>();
    const [suggesting, setSuggesting] = useState<{ faction: Faction, number: number }>();
    const [deleting, setDeleting] = useState<IPlaytestCard>();

    const factionSlots = useMemo(() => {
        const map = new Map<Faction, DraftSlot[]>();
        let slotNumber = 1;
        const totalSlots = Object.values(project.cardCount).reduce((total, current) => total + current, 0);
        for (const faction of factions) {
            const count = project.cardCount[faction] ?? 0;
            const slots: DraftSlot[] = [];

            if (cardsData) {
                for (let i = 0; i < count; i++) {
                    const number = slotNumber++;
                    const options = cardsData.items
                        .filter(c => c.faction === faction && c.number === number)
                        .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());

                    slots.push({ faction, number, options, totalSlots });
                }
            }

            map.set(faction, slots);
        }

        return map;
    }, [cardsData, project.cardCount]);


    if (isLoading) {
        return (
            <div className="space-y-2">
                {factions.map((faction) => <Skeleton key={faction} className="w-full h-64 sm:h-72 rounded-md"/>)}
            </div>
        );
    }

    return (
        <>
            <div className="flex flex-col gap-2">
                {[...factionSlots.entries()].map(([faction, slots]) =>
                    <FactionCarousel
                        key={faction}
                        faction={faction}
                        slots={slots}
                        onNew={(slot) => setEditing({ project: project.number, number: slot.number, code: parseCardCode(false, project.number, slot.number), faction: slot.faction, version: "0.0.0" })}
                        onSuggestion={(slot) => setSuggesting({ faction: slot.faction, number: slot.number })}
                        onEdit={(card) => setEditing(card)}
                        onDelete={(card) => setDeleting(card)}
                    />
                )}
            </div>
            <EditCardModal isOpen={!!editing} card={editing} onClose={() => setEditing(undefined)} onSave={(card) => addToast({ title: "Successfully saved", color: "success", description: `Slot #${card.number} has been saved` })}/>
            <SelectSuggestionModal
                isOpen={!!suggesting}
                project={project.number}
                number={suggesting?.number ?? 0}
                faction={suggesting?.faction}
                unselectable={cardsData?.items.filter((card) => card.faction === suggesting?.faction && card.suggestionId).map((card) => card.suggestionId!)}
                onClose={() => setSuggesting(undefined)}
                onSave={(card) => addToast({ title: "Successfully saved", color: "success", description: `Slot #${card.number} has been saved` })}
            />
            <DeleteCardModal isOpen={!!deleting} card={deleting} onClose={() => setDeleting(undefined)} onDelete={(card) => addToast({ title: "Successfully deleted", color: "success", description: `Slot #${card.number} has been deleted` })}/>
        </>
    );
};

type ProjectDraftingProps = { project: IProject; }

function FactionCarousel({ className, style, faction, slots, onNew, onSuggestion, onEdit, onDelete }: FactionCarouselProps) {
    return (
        <div className={classNames("relative border border-content3 overflow-hidden")}>
            <div className="absolute -top-8 right-48 flex items-center justify-center pointer-events-none select-none">
                <ThronesIcon name={faction} className={classNames("text-[8rem] sm:text-[10rem]", watermarkClasses[faction])}/>
            </div>
            <div className="relative flex h-20">
                <div className={classNames("text-2xl sm:text-3xl font-cinzel tracking-widest p-4 flex items-center gap-2 grow", className)} style={style}>
                    {factionNames[faction]}
                </div>
            </div>
            <div className="relative">
                <div className="w-full h-64 sm:h-72 md:h-80 flex overflow-x-auto overflow-y-hidden scroll-smooth snap-x snap-mandatory [&::-webkit-scrollbar]:hidden gap-2 p-2">
                    {slots.map((slot) => <FactionSlot slot={slot} onNew={onNew} onSuggestion={onSuggestion} onEdit={onEdit} onDelete={onDelete}/>)}
                </div>
            </div>
        </div>
    );
}
type FactionCarouselProps = Omit<BaseElementProps, "children"> & {
    faction: Faction;
    slots: DraftSlot[];
    onNew: (slot: DraftSlot) => void;
    onSuggestion: (slot: DraftSlot) => void;
    onEdit: (card: IPlaytestCard) => void;
    onDelete: (card: IPlaytestCard) => void;
}

type DropdownItemDef = {
    key: string;
    label: string;
    group: string;
    icon: IconDefinition;
    onPress: () => void;
    className?: string;
    style?: React.CSSProperties;
};
function FactionSlot({ slot, onNew, onSuggestion, onEdit, onDelete }: FactionSlotProps) {
    const [selectedIndex, setSelectedIndex] = useState<number>(Math.max(0, slot.options.length - 1));

    useEffect(() => {
        setSelectedIndex(Math.max(0, slot.options.length - 1));
    }, [slot.options.length]);

    const canEdit = usePermission(Permission.EDIT_CARDS);
    const canDelete = usePermission(Permission.DELETE_CARDS);
    if (slot.options.length > 0) {
        return (
            <CardStack key={slot.number} cards={[...slot.options].reverse()} selectedIndex={selectedIndex} tilt={3} className="size-full" style={{ zIndex: slot.totalSlots - slot.number }} onClick={() => setSelectedIndex((prev) => prev === 0 ? slot.options.length - 1 : --prev)}>
                {
                    (card) => {
                        const dropdownItems: DropdownItemDef[] = [
                            { key: "new", label: "Add New", group: "Slot Actions", icon: faStarOfLife, onPress: () => onNew(slot) },
                            { key: "suggestion", label: "Add Suggestion", group: "Slot Actions", icon: faAddressCard, onPress: () => onSuggestion(slot) },
                            canEdit && { key: "edit", label: "Edit", group: "Card Actions", icon: faPencil, onPress: () => onEdit(card) },
                            canDelete && { key: "delete", label: "Delete", group: "Card Actions", icon: faTrash, className: "text-danger", onPress: () => onDelete(card) }
                        ].flatMap(item => item ? [item] : []);

                        const groupedItems = groupBy(dropdownItems, item => item.group);

                        return (
                            <div className="size-full relative">
                                <div className="absolute top-0 right-0 z-1 opacity-25 p-1 hover:opacity-90 transition-opacity">
                                    <Dropdown>
                                        <DropdownTrigger>
                                            <Button isIconOnly radius="full" size="sm" variant="faded">
                                                <FontAwesomeIcon icon={faEllipsis}/>
                                            </Button>
                                        </DropdownTrigger>
                                        <DropdownMenu emptyContent="No actions">
                                            {Object.entries(groupedItems).map(([group, items]) => (
                                                <DropdownSection key={group} title={group}>
                                                    {items.map(item => (
                                                        <DropdownItem key={item.key} className={item.className} style={item.style} startContent={<FontAwesomeIcon icon={item.icon}/>} onPress={item.onPress}>
                                                            {item.label}
                                                        </DropdownItem>
                                                    ))}
                                                </DropdownSection>
                                            ))}
                                        </DropdownMenu>
                                    </Dropdown>
                                </div>
                                <CardPreview card={renderPlaytestingCard(card, { top: "Draft Option", middle: `Card #${slot.number}`, bottom: card.suggestionId ? "From Suggestion" : "New Design" })}/>
                            </div>
                        );
                    }
                }
            </CardStack>
        );
    }
    return <EmptyCardSlot
        key={slot.number}
        faction={slot.faction}
        onNew={() => onNew(slot)}
        onSuggestion={() => onSuggestion(slot)}
    />;
}

type FactionSlotProps = {
    slot: DraftSlot;
    onNew: (slot: DraftSlot) => void;
    onSuggestion: (slot: DraftSlot) => void;
    onEdit: (card: IPlaytestCard) => void;
    onDelete: (card: IPlaytestCard) => void;
}

function EmptyCardSlot({ faction, onNew = () => true, onSuggestion = () => true }: EmptyCardSlotProps) {
    const [isActive, setIsActive] = useState(false);

    return (
        <div className="relative">
            <CardBlank
                className={classNames({ "transition-all duration-200 ease-in-out hover:brightness-150": !isActive, "brightness-150": isActive })}
                rounded
                classNames={{ inner:"flex flex-col justify-center items-center border-12 bg-default-100 brightness-50" }}
                styles={{ inner: { borderColor: thronesColors[faction] } }}
                onClick={() => !isActive && setIsActive(true)}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <RadialMenu className="size-16 sm:size-20 md:size-28 lg:size-32" isOpen={isActive} onOpenChange={setIsActive} classNames={{ button: "h-10 w-10" }}>
                    <PermissionGate requires={Permission.CREATE_CARDS}>
                        <Tooltip content="Create new card">
                            <Button
                                isIconOnly
                                radius="full"
                                variant="flat"
                                color="primary"
                                size="sm"
                                className="shadow-sm text-tiny size-8 md:text-small md:size-10 lg:text-medium lg:size-12"
                                onPress={onNew}
                            >
                                <FontAwesomeIcon icon={faStarOfLife}/>
                            </Button>
                        </Tooltip>
                    </PermissionGate>
                    <PermissionGate requires={Permission.READ_SUGGESTIONS}>
                        <Tooltip content="Choose suggestion">
                            <Button
                                isIconOnly
                                radius="full"
                                variant="flat"
                                color="primary"
                                size="sm"
                                className="shadow-sm text-tiny size-8 md:text-small md:size-10 lg:text-medium lg:size-12"
                                onPress={onSuggestion}
                            >
                                <FontAwesomeIcon icon={faAddressCard}/>
                            </Button>
                        </Tooltip>
                    </PermissionGate>
                </RadialMenu>
            </div>
        </div>
    );
};

type EmptyCardSlotProps = { faction: Faction, onNew?: () => void, onSuggestion?: () => void }