import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    MeasuringStrategy,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors
} from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { motion } from "framer-motion";
import { IArtist, ISourcedArtwork, ISourcedOption } from "common/models/artwork";
import { ISlotRef } from "common/models/slots";
import { reorderTransition } from "../../../constants";
import { dropAnimation as DROP_ANIMATION } from "../../project/releases/releaseDnd";
import SortableSourcedOption, { SourcedOptionCard } from "./sourcedOptionCard";

const EMPTY: ISourcedArtwork = { options: [] };

// Long enough to cover dnd-kit's own drop transition before framer is allowed to measure again
const DROP_SETTLE_MS = 300;

export default function SourcedPanel({
    sourced = EMPTY,
    artists,
    slot,
    isDisabled,
    onAdd,
    onChange
}: SourcedPanelProps) {
    // Matches the release board's sensors - a touch drag needs a hold, so the page still scrolls freely
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
    );

    const setOptions = (options: ISourcedOption[], selectedId = sourced.selectedId) => {
        // A selection which no longer exists would gate the status against a piece nobody can see
        const stillExists = options.some((option) => option.id === selectedId);
        onChange({ options, selectedId: stillExists ? selectedId : undefined });
    };

    // The card being carried, drawn in a DragOverlay the way the release board does it - dnd-kit animates it
    // from where it was let go to the space now waiting for it, rather than it just appearing in the gap
    const [activeId, setActiveId] = useState<string>();
    const activeOption = sourced.options.find((option) => option.id === activeId);

    // Framer stands down for the length of that flight, so it doesn't re-animate the same move a second time
    // from measurements taken before the drag
    const [isSettlingDrop, setIsSettlingDrop] = useState(false);

    useEffect(() => {
        if (!isSettlingDrop) {
            return;
        }
        const timer = setTimeout(() => setIsSettlingDrop(false), DROP_SETTLE_MS);
        return () => clearTimeout(timer);
    }, [isSettlingDrop]);

    const onDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));

    const onDragEnd = ({ active, over }: DragEndEvent) => {
        setActiveId(undefined);
        if (!over || active.id === over.id) {
            return;
        }
        const from = sourced.options.findIndex((option) => option.id === active.id);
        const to = sourced.options.findIndex((option) => option.id === over.id);
        if (from < 0 || to < 0) {
            return;
        }
        setIsSettlingDrop(true);
        setOptions(arrayMove(sourced.options, from, to));
    };

    // The chosen piece leads the list, so what the card is actually using is always the first thing read
    const onSelect = (id: string) => {
        const chosen = sourced.options.find((option) => option.id === id);
        if (!chosen) {
            return;
        }
        const isSelected = sourced.selectedId === id;
        if (isSelected) {
            onChange({ ...sourced, selectedId: undefined });
            return;
        }
        setOptions([chosen, ...sourced.options.filter((option) => option.id !== id)], id);
    };

    // What each option is called, in list order: "#2 Preference - Stephen Patane (1)". The trailing count
    // only appears once an artist has more than one piece in the running.
    const titles = useMemo(() => {
        const totals = new Map<string, number>();
        for (const option of sourced.options) {
            if (option.artist) {
                totals.set(option.artist, (totals.get(option.artist) ?? 0) + 1);
            }
        }

        const seen = new Map<string, number>();
        return sourced.options.map((option, index) => {
            const preference = `#${index + 1} Preference`;
            const artist = artists.find((entry) => entry.id === option.artist);
            if (!artist || !option.artist) {
                return preference;
            }

            const ordinal = (seen.get(option.artist) ?? 0) + 1;
            seen.set(option.artist, ordinal);
            const suffix = (totals.get(option.artist) ?? 0) > 1 ? ` (${ordinal})` : "";
            return `${preference} - ${artist.name}${suffix}`;
        });
    }, [sourced.options, artists]);

    // Portalled out, or a transformed ancestor re-bases the overlay and the clipping cuts it off
    const overlay = (
        <DragOverlay dropAnimation={DROP_ANIMATION}>
            {activeOption && (
                <SourcedOptionCard
                    isOverlay
                    option={activeOption}
                    title={titles[sourced.options.indexOf(activeOption)]}
                    artists={artists}
                    isSelected={sourced.selectedId === activeOption.id}
                    onChange={() => undefined}
                    onSelect={() => undefined}
                    onRemove={() => undefined}
                />
            )}
        </DragOverlay>
    );

    return (
        <div className="flex flex-col gap-3">
            {sourced.options.length === 0 ? (
                <div className="p-6 flex flex-col items-center gap-3 text-center text-sm text-foreground/50 border border-dashed border-content3 rounded-md">
                    <span>
                        No options yet. Add every piece being considered, so the choice is on record rather than in
                        somebody's memory.
                    </span>
                    {!isDisabled && (
                        <Button
                            size="sm"
                            variant="flat"
                            startContent={<FontAwesomeIcon icon={faPlus} />}
                            onPress={onAdd}
                        >
                            Add option
                        </Button>
                    )}
                </div>
            ) : (
                <DndContext
                    sensors={sensors}
                    measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDragCancel={() => setActiveId(undefined)}
                >
                    <SortableContext
                        items={sourced.options.map((option) => option.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="flex flex-col gap-3">
                            {sourced.options.map((option, index) => (
                                <motion.div
                                    key={option.id}
                                    layout={!isSettlingDrop}
                                    transition={reorderTransition}
                                    className="relative"
                                >
                                    <div className="absolute inset-0 p-3 rounded-md border-2 border-dashed border-content3 bg-content2/30">
                                        <span className="font-cinzel uppercase tracking-[0.2em] text-sm text-foreground/30">
                                            #{index + 1} Preference
                                        </span>
                                    </div>
                                    <SortableSourcedOption
                                        option={option}
                                        title={titles[index]}
                                        artists={artists}
                                        slot={slot}
                                        path={`sourced.options.${index}`}
                                        isSelected={sourced.selectedId === option.id}
                                        isDisabled={isDisabled}
                                        onChange={(updated) =>
                                            setOptions(
                                                sourced.options.map((entry) =>
                                                    entry.id === option.id ? updated : entry
                                                )
                                            )
                                        }
                                        onSelect={() => onSelect(option.id)}
                                        onRemove={() =>
                                            setOptions(sourced.options.filter((entry) => entry.id !== option.id))
                                        }
                                    />
                                </motion.div>
                            ))}
                        </div>
                    </SortableContext>
                    {createPortal(overlay, document.body)}
                </DndContext>
            )}
            {!isDisabled && sourced.options.length > 0 && (
                <Button
                    size="sm"
                    variant="flat"
                    className="hidden sm:flex self-start"
                    startContent={<FontAwesomeIcon icon={faPlus} />}
                    onPress={onAdd}
                >
                    Add option
                </Button>
            )}
        </div>
    );
}

type SourcedPanelProps = {
    sourced?: ISourcedArtwork;
    artists: IArtist[];
    /** The card being edited, forwarded to ArtistSelect */
    slot?: ISlotRef;
    isDisabled?: boolean;
    onAdd: () => void;
    onChange: (sourced: ISourcedArtwork) => void;
};
