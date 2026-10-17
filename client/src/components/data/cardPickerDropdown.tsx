import { KeyboardEvent, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import classNames from "classnames";
import { Input, Popover, PopoverContent, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faMagnifyingGlass, faXmarkCircle } from "@fortawesome/free-solid-svg-icons";
import { AnimatePresence, motion } from "framer-motion";
import { ILabeledCard } from "common/models/cards";
import { Filter } from "common/types";
import { escapeRegExp } from "common/utils";
import { useSearchTDBCardsQuery } from "../../api/thronesdb";
import CardGrid from "../cardGrid";
import { BaseElementProps } from "../../types";
import { EASE_STANDARD } from "../../constants";

const SEARCH_DEBOUNCE_MS = 300;
const PER_PAGE = 10;

// Popover's own base wrapper defaults to z-0, below the z-50 Modal this field lives inside.
const POPOVER_CLASSNAMES = { base: "z-[60]", content: "p-0" };

// Container-query breakpoints, not viewport sm:/lg: ones - this panel's own width decides how many
// columns fit, not the viewport's.
const GRID_COLUMNS_CLASSNAME = "gap-3 !grid-cols-2 @min-[380px]:!grid-cols-3 @min-[560px]:!grid-cols-5";

/** One search result tile - the image still needs to download even though its data is already
 *  fetched, so this mirrors CardImage's own skeleton-until-loaded/fade-in. */
function GridTile({
    card,
    isSelected,
    isDisabled,
    onToggle
}: {
    card: ILabeledCard;
    isSelected: boolean;
    isDisabled?: boolean;
    onToggle: () => void;
}) {
    const [loadedUrl, setLoadedUrl] = useState<string>();
    const isLoading = loadedUrl !== card.imageUrl;
    const isPlot = card.type === "plot";

    return (
        <button
            type="button"
            aria-label={card.label}
            aria-pressed={isSelected}
            disabled={isDisabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onToggle}
            className={classNames(
                "relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-content2 transition-transform cursor-pointer",
                isPlot ? "aspect-[333/240]" : "aspect-[240/333]",
                isSelected ? "ring-4 ring-primary-500" : "hover:scale-[1.02]"
            )}
        >
            {isLoading && <Skeleton className="absolute inset-0 h-full w-full rounded-[inherit]" />}
            <img
                src={card.imageUrl}
                alt={card.label}
                onLoad={() => setLoadedUrl(card.imageUrl)}
                className={classNames(
                    "h-full w-full object-contain transition-opacity duration-300",
                    isLoading ? "opacity-0" : "opacity-100"
                )}
            />
            <AnimatePresence>
                {isSelected && (
                    <motion.span
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ duration: 0.15, ease: EASE_STANDARD }}
                        className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    >
                        <FontAwesomeIcon icon={faCheck} className="text-xs" />
                    </motion.span>
                )}
            </AnimatePresence>
        </button>
    );
}

/** A search box that opens a dropdown of matching card images rather than a picker sitting inline in
 *  the page - matches on name OR traits, and picking a card doesn't close the dropdown. */
export default function CardPickerDropdown({
    className,
    style,
    ariaLabel,
    placeholder,
    value,
    onChange,
    isDisabled
}: CardPickerDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const anchorRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handle = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(handle);
    }, [search]);

    // Read synchronously inside the focusin listener below, which must stay mounted regardless of isOpen.
    const isOpenRef = useRef(isOpen);
    isOpenRef.current = isOpen;

    // PopoverContent's react-aria Dialog focuses itself on mount, stealing focus from this input.
    // Reacting to the focus event (its element is always tabIndex=-1) beats racing its own effect.
    useEffect(() => {
        const handleFocusIn = () => {
            if (!isOpenRef.current) {
                return;
            }
            const active = document.activeElement as HTMLElement | null;
            if (active && active !== inputRef.current && active.tabIndex === -1) {
                inputRef.current?.focus();
            }
        };
        document.addEventListener("focusin", handleFocusIn);
        return () => document.removeEventListener("focusin", handleFocusIn);
    }, []);

    const filter = useMemo((): Filter<ILabeledCard>[] => {
        const baseClause = { workInProgress: false } as Filter<ILabeledCard>;
        if (!debouncedSearch) {
            return [baseClause];
        }
        const regex = { $regex: `(?i)${escapeRegExp(debouncedSearch)}` };
        return [
            { ...baseClause, name: regex } as Filter<ILabeledCard>,
            { ...baseClause, traits: regex } as Filter<ILabeledCard>
        ];
    }, [debouncedSearch]);

    const queryArgs = useMemo(() => ({ filter, orderBy: { name: "asc" as const, code: "asc" as const } }), [filter]);

    const toggle = (code: string) => {
        if (isDisabled) {
            return;
        }
        onChange(value.includes(code) ? value.filter((v) => v !== code) : [...value, code]);
    };

    // Escape is handled here, not left to Popover's own handling, since that only listens within its
    // content - this input is a sibling of the content, not a descendant.
    const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
            setIsOpen(false);
        }
    };

    // Opens on click, not focus: Popover's FocusScope restores focus to this input when it closes,
    // and an onFocus handler would read that as "open again", reopening it on every outside click.
    const onInputClick = () => setIsOpen(true);

    return (
        <Popover
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            triggerRef={anchorRef as RefObject<HTMLElement>}
            placement="bottom-start"
            classNames={POPOVER_CLASSNAMES}
        >
            <div ref={anchorRef} className={className} style={style}>
                <Input
                    ref={inputRef}
                    size="sm"
                    aria-label={ariaLabel}
                    placeholder={placeholder}
                    value={search}
                    onValueChange={(v) => {
                        setSearch(v);
                        setIsOpen(true);
                    }}
                    onClick={onInputClick}
                    onKeyDown={onInputKeyDown}
                    isDisabled={isDisabled}
                    startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="text-foreground/40" />}
                    endContent={
                        search ? (
                            <button
                                type="button"
                                aria-label="Clear search"
                                className="cursor-pointer"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setSearch("")}
                            >
                                <FontAwesomeIcon icon={faXmarkCircle} className="text-default-400" />
                            </button>
                        ) : null
                    }
                />
            </div>
            <PopoverContent>
                <div className="@container w-[45rem] max-w-[calc(100vw-2rem)] max-h-[28rem] overflow-y-auto p-3">
                    <CardGrid<ILabeledCard>
                        query={useSearchTDBCardsQuery}
                        queryArgs={queryArgs}
                        perPage={PER_PAGE}
                        keyExtractor={(card) => card.code ?? ""}
                        className={GRID_COLUMNS_CLASSNAME}
                        emptyContent="No cards match that search."
                    >
                        {(card) => (
                            <GridTile
                                card={card}
                                isSelected={value.includes(card.code!)}
                                isDisabled={isDisabled}
                                onToggle={() => toggle(card.code!)}
                            />
                        )}
                    </CardGrid>
                </div>
            </PopoverContent>
        </Popover>
    );
}

type CardPickerDropdownProps = Omit<BaseElementProps, "children"> & {
    ariaLabel?: string;
    placeholder?: string;
    value: string[];
    onChange: (codes: string[]) => void;
    isDisabled?: boolean;
};
