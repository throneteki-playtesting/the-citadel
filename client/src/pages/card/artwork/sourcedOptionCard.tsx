import { CSSProperties } from "react";
import { Button, Checkbox, Chip, Input, Textarea } from "@heroui/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan, faGripVertical, faStar, faTrash } from "@fortawesome/free-solid-svg-icons";
import { faStar as faStarOutline } from "@fortawesome/free-regular-svg-icons";
import classNames from "classnames";
import { ArtworkContactState, artworkContactStates, IArtist, ISourcedOption } from "common/models/artwork";
import { artworkContactMeta, FFG_ARTWORK_DESCRIPTION } from "../../../constants";
import { UIColor } from "../../../types";
import { TouchTooltip } from "../../../components/touchTooltip";
import ArtworkImage from "../../../components/artwork/artworkImage";
import ArtistSelect from "../../../components/artwork/artistSelect";
import OpenLink from "../../../components/artwork/openLink";

// The run an approach actually walks. Denied is a state but not a step on it - see ContactPicker.
// Held as the whole union rather than the filtered subset, so a denied option can still be looked up in it
const CONTACT_PROGRESSION: ArtworkContactState[] = artworkContactStates.filter((state) => state !== "denied");

// Written out per colour rather than composed, since Tailwind only sees class names it can read whole
const CONTACT_CURRENT_CLASSES: Partial<Record<UIColor, string>> = {
    default: "bg-default-400 border-default-400 text-default-foreground",
    primary: "bg-primary border-primary text-primary-foreground",
    success: "bg-success border-success text-success-foreground",
    danger: "bg-danger border-danger text-danger-foreground"
};

const CONTACT_REACHED_CLASSES: Partial<Record<UIColor, string>> = {
    default: "bg-default-200 border-default-300 text-foreground/70",
    primary: "bg-primary-100 border-primary-200 text-primary-700",
    success: "bg-success-100 border-success-200 text-success-700",
    danger: "bg-danger-100 border-danger-200 text-danger-700"
};

/**
 * The option as it sits in the list. The card itself is presentational, so the very same markup can be
 * handed to the DragOverlay - anything less and the card you carry isn't the card you picked up
 */
export default function SortableSourcedOption(props: SourcedOptionCardProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: props.option.id,
        disabled: props.isDisabled
    });

    return (
        <SourcedOptionCard
            {...props}
            nodeRef={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            handleProps={{ ...attributes, ...listeners }}
            isDragging={isDragging}
        />
    );
}

/** One candidate piece. Denied options stay put, dimmed - who said no is worth keeping visible */
export function SourcedOptionCard({
    option,
    title,
    artists,
    name,
    isSelected,
    isDisabled,
    onChange,
    onSelect,
    onRemove,
    nodeRef,
    style,
    handleProps,
    isDragging,
    isOverlay
}: SourcedOptionCardProps & SourcedOptionDragProps) {
    const isDenied = option.contact === "denied";
    const artist = artists.find((entry) => entry.id === option.artist);

    const set = <K extends keyof ISourcedOption>(key: K, value: ISourcedOption[K]) =>
        onChange({ ...option, [key]: value });

    return (
        <div
            ref={nodeRef}
            style={style}
            className={classNames(
                "relative flex flex-col gap-3 p-3 rounded-md border bg-content1",
                isSelected ? "border-primary ring-1 ring-primary/40" : "border-content3",
                isDragging && "invisible",
                isOverlay && "shadow-xl cursor-grabbing",
                isDenied && !isSelected && "brightness-75"
            )}
        >
            <div className="flex items-center gap-1">
                {!isDisabled && (
                    <button
                        type="button"
                        aria-label="Reorder option"
                        className="shrink-0 px-1 text-foreground/30 hover:text-foreground/60 cursor-grab touch-manipulation"
                        {...handleProps}
                    >
                        <FontAwesomeIcon icon={faGripVertical} />
                    </button>
                )}
                <span className="shrink-0 font-cinzel uppercase tracking-wide text-xs text-foreground/60 truncate">
                    {title}
                </span>
                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    {isSelected && (
                        <Chip size="sm" color="primary" variant="flat">
                            Final choice
                        </Chip>
                    )}
                    {isDenied && (
                        <TouchTooltip
                            content={<div className="max-w-56 text-xs">{artworkContactMeta.denied.description}</div>}
                        >
                            <Chip size="sm" color="danger" variant="flat" className="cursor-help">
                                Denied
                            </Chip>
                        </TouchTooltip>
                    )}
                    {artist?.blanketPermission && (
                        <TouchTooltip
                            content={
                                <div className="max-w-56 text-xs">
                                    {artist.name} has allowed all of their work up front, so this counts as granted.
                                </div>
                            }
                        >
                            <Chip size="sm" color="success" variant="flat" className="cursor-help">
                                Blanket permission
                            </Chip>
                        </TouchTooltip>
                    )}
                </div>
                <TouchTooltip content={isSelected ? "Chosen as the final artwork" : "Set as the final artwork"}>
                    <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        color={isSelected ? "primary" : "default"}
                        aria-label="Set as final artwork"
                        isDisabled={isDisabled}
                        onPress={onSelect}
                    >
                        <FontAwesomeIcon icon={isSelected ? faStar : faStarOutline} />
                    </Button>
                </TouchTooltip>
                <TouchTooltip content="Remove option">
                    <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        color="danger"
                        aria-label="Remove option"
                        isDisabled={isDisabled}
                        onPress={onRemove}
                    >
                        <FontAwesomeIcon icon={faTrash} />
                    </Button>
                </TouchTooltip>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
                <div className="sm:w-56 shrink-0">
                    <ArtworkImage url={option.url} alt="Sourced artwork option" />
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-3">
                    <div className="flex flex-col md:flex-row gap-3">
                        <Input
                            label="Image link"
                            size="sm"
                            className="flex-1 min-w-0"
                            name={name}
                            isDisabled={isDisabled}
                            value={option.url}
                            onValueChange={(value) => set("url", value)}
                            endContent={<OpenLink url={option.url} label="Open image in a new tab" />}
                        />
                        <div className="flex-1 min-w-0">
                            <ArtistSelect
                                size="sm"
                                selectedId={option.artist}
                                isDisabled={isDisabled}
                                onChange={(id) => set("artist", id)}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                        <ContactPicker
                            value={option.contact}
                            isDisabled={isDisabled}
                            onChange={(contact) => set("contact", contact)}
                        />
                        <TouchTooltip content={<div className="max-w-64 text-xs">{FFG_ARTWORK_DESCRIPTION}</div>}>
                            <div className="w-fit md:ml-auto">
                                <Checkbox
                                    size="sm"
                                    isSelected={!!option.ffg}
                                    isDisabled={isDisabled}
                                    onValueChange={(value) => set("ffg", value)}
                                >
                                    <span className="text-sm whitespace-nowrap">FFG artwork</span>
                                </Checkbox>
                            </div>
                        </TouchTooltip>
                    </div>
                    <Textarea
                        label="Notes"
                        size="sm"
                        minRows={2}
                        isDisabled={isDisabled}
                        value={option.notes ?? ""}
                        onValueChange={(value) => set("notes", value)}
                    />
                </div>
            </div>
        </div>
    );
}

type SourcedOptionCardProps = {
    option: ISourcedOption;
    /** Its place in the running and who made it, eg. "#2 Preference - Stephen Patane (1)" */
    title: string;
    artists: IArtist[];
    /** The link's path in the artwork schema, so the form can attach its error to this input */
    name?: string;
    isSelected: boolean;
    isDisabled?: boolean;
    onChange: (option: ISourcedOption) => void;
    onSelect: () => void;
    onRemove: () => void;
};

/** Supplied by the sortable wrapper, or by the DragOverlay for the copy being carried */
type SourcedOptionDragProps = {
    nodeRef?: (node: HTMLElement | null) => void;
    style?: CSSProperties;
    handleProps?: Record<string, unknown>;
    isDragging?: boolean;
    isOverlay?: boolean;
};

/**
 * The approach as one progression, so states which can't coexist never can. Plain buttons in order, with
 * everything up to the current one filled in - that trail is what says it is a flow, without any joinery
 * between the buttons having to say it.
 *
 * Denied is not a step on that run. It is the run being called off, so it sits apart and, while it holds,
 * greys the whole progression out - there is nothing to advance through until it is taken back.
 */
function ContactPicker({ value, isDisabled, onChange }: ContactPickerProps) {
    const isDenied = value === "denied";
    const currentIndex = CONTACT_PROGRESSION.indexOf(value);
    const deniedMeta = artworkContactMeta.denied;

    return (
        <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs text-foreground/50">Permission</span>
            <div className="flex flex-wrap items-center gap-3">
                <div
                    className={classNames("flex flex-wrap items-stretch gap-1", isDenied && "brightness-75 grayscale")}
                >
                    {CONTACT_PROGRESSION.map((state, index) => {
                        const meta = artworkContactMeta[state];
                        const isCurrent = !isDenied && value === state;
                        const isReached = !isDenied && index <= currentIndex;

                        return (
                            <TouchTooltip
                                key={state}
                                content={<div className="max-w-56 text-xs">{meta.description}</div>}
                            >
                                <button
                                    type="button"
                                    disabled={isDisabled || isDenied}
                                    aria-current={isCurrent}
                                    onClick={() => onChange(state)}
                                    className={classNames(
                                        "px-2 py-1 rounded-md border text-xs whitespace-nowrap transition-colors",
                                        isDisabled || isDenied ? "cursor-default" : "cursor-pointer",
                                        contactChevronClasses(meta.color, isCurrent, isReached)
                                    )}
                                >
                                    {meta.label}
                                </button>
                            </TouchTooltip>
                        );
                    })}
                </div>

                <TouchTooltip
                    content={
                        <div className="max-w-56 text-xs">
                            {isDenied ? "Click to take the denial back" : deniedMeta.description}
                        </div>
                    }
                >
                    <button
                        type="button"
                        disabled={isDisabled}
                        aria-pressed={isDenied}
                        onClick={() => onChange(isDenied ? "responded" : "denied")}
                        className={classNames(
                            "shrink-0 px-2 py-1 rounded-md border text-xs whitespace-nowrap transition-colors",
                            isDisabled ? "cursor-default opacity-60" : "cursor-pointer",
                            isDenied
                                ? CONTACT_CURRENT_CLASSES.danger
                                : "bg-content2 border-content3 text-foreground/40 hover:text-danger"
                        )}
                    >
                        <FontAwesomeIcon icon={faBan} className="mr-1" />
                        {deniedMeta.label}
                    </button>
                </TouchTooltip>
            </div>
        </div>
    );
}

// Current step is solid, everything reached before it is tinted, and the rest stays plain
function contactChevronClasses(color: UIColor, isCurrent: boolean, isReached: boolean) {
    if (isCurrent) {
        return CONTACT_CURRENT_CLASSES[color];
    }
    if (isReached) {
        return CONTACT_REACHED_CLASSES[color];
    }
    return "bg-content2 border-content3 text-foreground/40 hover:text-foreground/70";
}

type ContactPickerProps = {
    value: ArtworkContactState;
    isDisabled?: boolean;
    onChange: (value: ArtworkContactState) => void;
};
