import { CSSProperties } from "react";
import { Button, Checkbox, Chip, Input, Textarea } from "@heroui/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan, faCircleInfo, faGripVertical, faStar, faTrash } from "@fortawesome/free-solid-svg-icons";
import { faStar as faStarOutline } from "@fortawesome/free-regular-svg-icons";
import { AnimatePresence, motion } from "framer-motion";
import classNames from "classnames";
import { ArtworkContactState, canImplyPermission, IArtist, ISourcedOption } from "common/models/artwork";
import { ISlotRef } from "common/models/slots";
import { artworkContactMeta, FFG_ARTWORK_DESCRIPTION, reorderTransition } from "../../../constants";
import { UIColor } from "../../../types";
import { TouchTooltip } from "../../../components/touchTooltip";
import ArtworkImage from "../../../components/artwork/artworkImage";
import ArtistSelect from "../../../components/artwork/artistSelect";
import OpenLink from "../../../components/artwork/openLink";

// The literal step order - denied/implied are states an option can be in, not steps on this run, so
// they're never in this list rather than filtered back out of it. See ContactPicker.
const CONTACT_PROGRESSION: ArtworkContactState[] = ["none", "contacted", "responded", "granted"];

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

// The option as it sits in the list. Presentational, so the same markup can be handed to the DragOverlay
export default function SortableSourcedOption(props: SourcedOptionCardProps) {
    // The final choice is out of the sort entirely, droppable too, or another option displaces it
    const isFixed = props.isDisabled || props.isSelected;
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: props.option.id,
        disabled: { draggable: isFixed, droppable: isFixed }
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
    path,
    slot,
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

    // Gathered up front so the wrapping header only gives them a line when there is one to fill
    const chips = [
        isSelected && (
            <Chip key="selected" size="sm" color="primary" variant="flat">
                Final choice
            </Chip>
        ),
        isDenied && (
            <TouchTooltip
                key="denied"
                content={<div className="max-w-56 text-xs">{artworkContactMeta.denied.description}</div>}
            >
                <Chip size="sm" color="danger" variant="flat" className="cursor-help">
                    Denied
                </Chip>
            </TouchTooltip>
        ),
        artist?.blanketPermission && (
            <TouchTooltip
                key="blanket"
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
        )
    ].filter(Boolean);

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
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
                <AnimatePresence initial={false}>
                    {!isDisabled && !isSelected && (
                        <motion.button
                            type="button"
                            aria-label="Reorder option"
                            className="shrink-0 overflow-hidden text-foreground/30 hover:text-foreground/60 cursor-grab touch-manipulation"
                            initial={{ width: 0, opacity: 0, scale: 0.6 }}
                            animate={{ width: "auto", opacity: 1, scale: 1 }}
                            exit={{ width: 0, opacity: 0, scale: 0.6 }}
                            transition={reorderTransition}
                            {...handleProps}
                        >
                            <FontAwesomeIcon icon={faGripVertical} className="px-1" />
                        </motion.button>
                    )}
                </AnimatePresence>
                <span className="flex-1 min-w-0 truncate font-cinzel uppercase tracking-wide text-xs text-foreground/60">
                    {title}
                </span>
                {chips.length > 0 && (
                    <div className="order-last sm:order-none basis-full sm:basis-auto shrink-0 flex flex-wrap items-center gap-1.5">
                        {chips}
                    </div>
                )}
                <TouchTooltip content={isSelected ? "Chosen as the final artwork" : "Set as the final artwork"}>
                    <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        color={isSelected ? "primary" : "default"}
                        aria-label="Set as final artwork"
                        className="shrink-0"
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
                        className="shrink-0"
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
                            name={path && `${path}.url`}
                            isRequired
                            isDisabled={isDisabled}
                            value={option.url}
                            onValueChange={(value) => set("url", value)}
                            endContent={<OpenLink url={option.url} label="Open image in a new tab" />}
                        />
                        <div className="flex-1 min-w-0">
                            <ArtistSelect
                                size="sm"
                                name={path && `${path}.artist`}
                                isRequired
                                selectedId={option.artist}
                                slot={slot}
                                isDisabled={isDisabled}
                                onChange={(id) => set("artist", id)}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                        <ContactPicker
                            value={option.contact}
                            canImply={canImplyPermission(option)}
                            isDisabled={isDisabled}
                            onChange={(contact) => set("contact", contact)}
                        />
                        <TouchTooltip content={<div className="max-w-64 text-xs">{FFG_ARTWORK_DESCRIPTION}</div>}>
                            <div className="w-fit md:ml-auto">
                                <Checkbox
                                    size="sm"
                                    isSelected={!!option.ffg}
                                    isDisabled={isDisabled}
                                    onValueChange={(value) =>
                                        // Implied only exists because FFG is checked, so unchecking it
                                        // takes the permission back to unasked rather than leaving it on record
                                        onChange({
                                            ...option,
                                            ffg: value,
                                            contact: !value && option.contact === "implied" ? "none" : option.contact
                                        })
                                    }
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
    /** The option's own path in the artwork schema, so the form can attach errors to its fields */
    path?: string;
    /** The card being edited, forwarded to ArtistSelect */
    slot?: ISlotRef;
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

// The approach as one progression, everything up to the current step filled in. Denied calls the run off
// and greys it out; Implied fades in only while FFG is checked, sharing Granted's border.
function ContactPicker({ value, canImply, isDisabled, onChange }: ContactPickerProps) {
    const isDenied = value === "denied";
    const isImplied = value === "implied";
    const currentIndex = CONTACT_PROGRESSION.indexOf(value);
    const deniedMeta = artworkContactMeta.denied;
    const impliedMeta = artworkContactMeta.implied;
    const grantedIndex = CONTACT_PROGRESSION.length - 1;
    const showImplied = canImply && !isDenied;

    return (
        <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs text-foreground/50">Permission</span>
            <div className="flex flex-wrap items-center gap-3">
                <div
                    className={classNames("flex flex-wrap items-stretch gap-1", isDenied && "brightness-75 grayscale")}
                >
                    {CONTACT_PROGRESSION.slice(0, -1).map((state, index) => (
                        <ContactStep
                            key={state}
                            state={state}
                            isCurrent={!isDenied && value === state}
                            isReached={!isDenied && index <= currentIndex}
                            isDisabled={isDisabled || isDenied}
                            onClick={() => onChange(state)}
                        />
                    ))}
                    <div className="flex">
                        <ContactStep
                            state="granted"
                            isCurrent={!isDenied && value === "granted"}
                            isReached={!isDenied && grantedIndex <= currentIndex}
                            isDisabled={isDisabled || isDenied}
                            roundedClassName={showImplied ? "rounded-l-md rounded-r-none" : "rounded-md"}
                            onClick={() => onChange("granted")}
                        />
                        <AnimatePresence initial={false}>
                            {showImplied && (
                                <motion.button
                                    key="implied"
                                    type="button"
                                    disabled={isDisabled}
                                    aria-current={isImplied}
                                    onClick={() => onChange("implied")}
                                    initial={{ width: 0, opacity: 0, scale: 0.6 }}
                                    animate={{ width: "auto", opacity: 1, scale: 1 }}
                                    exit={{ width: 0, opacity: 0, scale: 0.6 }}
                                    transition={reorderTransition}
                                    className={classNames(
                                        "flex items-center gap-1 overflow-hidden -ml-px px-2 py-1 rounded-r-md rounded-l-none border text-xs whitespace-nowrap transition-colors",
                                        isDisabled ? "cursor-default" : "cursor-pointer",
                                        isImplied
                                            ? CONTACT_CURRENT_CLASSES.success
                                            : "bg-content2 border-content3 text-foreground/40 hover:text-success"
                                    )}
                                >
                                    {impliedMeta.label}
                                    <TouchTooltip
                                        content={<div className="max-w-56 text-xs">{impliedMeta.description}</div>}
                                    >
                                        <FontAwesomeIcon icon={faCircleInfo} className="opacity-70" />
                                    </TouchTooltip>
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </div>
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

// One chevron on the progression run, shared by the plain steps and Granted (which otherwise only
// differs in its corner rounding, once Implied is sharing its border)
function ContactStep({
    state,
    isCurrent,
    isReached,
    isDisabled,
    roundedClassName = "rounded-md",
    onClick
}: ContactStepProps) {
    const meta = artworkContactMeta[state];

    return (
        <TouchTooltip content={<div className="max-w-56 text-xs">{meta.description}</div>}>
            <button
                type="button"
                disabled={isDisabled}
                aria-current={isCurrent}
                onClick={onClick}
                className={classNames(
                    "px-2 py-1 border text-xs whitespace-nowrap transition-colors",
                    roundedClassName,
                    isDisabled ? "cursor-default" : "cursor-pointer",
                    contactChevronClasses(meta.color, isCurrent, isReached)
                )}
            >
                {meta.label}
            </button>
        </TouchTooltip>
    );
}

type ContactStepProps = {
    state: ArtworkContactState;
    isCurrent: boolean;
    isReached: boolean;
    isDisabled?: boolean;
    roundedClassName?: string;
    onClick: () => void;
};

type ContactPickerProps = {
    value: ArtworkContactState;
    /** Whether FFG artwork is checked on this option, the only condition under which implied is offered */
    canImply: boolean;
    isDisabled?: boolean;
    onChange: (value: ArtworkContactState) => void;
};
