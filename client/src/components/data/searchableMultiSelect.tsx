import { Chip, Select, SelectItem, SelectProps, SharedSelection } from "@heroui/react";
import { useInfiniteScroll } from "@heroui/use-infinite-scroll";
import { KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmarkCircle } from "@fortawesome/free-solid-svg-icons";
import { BaseElementProps, UIColor } from "../../types";
import { useInputFocusGuard } from "../../hooks/useInputFocusGuard";

const SENTINEL_KEY = "__searchable-select-sentinel__";

// A negative offset draws the focus ring inside, where the list's scroll container can't clip it
const ITEM_CLASS_NAMES = {
    title: "min-w-0 overflow-hidden",
    base: "data-[focus-visible=true]:outline-offset-[-2px]"
};

function SearchableMultiSelect<T extends object>({
    className,
    style,
    label,
    ariaLabel,
    size = "md",
    radius,
    variant,
    placeholder = "Search...",
    items,
    getKey,
    matches,
    renderItem,
    renderSelected,
    getChipLabel,
    getChipColor,
    chipClassName,
    hideChipsInInput,
    keepSearchOnSelect,
    selectedKeys,
    onSelectionChange,
    search,
    onSearchChange,
    hasMore,
    onLoadMore,
    onCreate,
    isCompact,
    itemClassName,
    isLoading,
    isDisabled
}: SearchableMultiSelectProps<T>) {
    const [isOpen, setIsOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const { guard: guardFocus, release: releaseFocusGuard } = useInputFocusGuard(inputRef);
    const [, scrollRef] = useInfiniteScroll({ hasMore, isEnabled: isOpen, shouldUseLoader: false, onLoadMore });
    const sentinel = useRef({} as T).current;

    const collectionItems = useMemo(() => [...items, sentinel], [items, sentinel]);
    // The always-selected sentinel keeps the collection non-empty; it must not count towards the clear button
    const selectedKeysWithSentinel = useMemo(() => [...selectedKeys, SENTINEL_KEY], [selectedKeys]);

    const term = search.trim();
    const isHidden = (item: T) => term.length > 0 && !!matches && !matches(item, term);

    // Whatever opened the dropdown hands focus to the trigger button first, per usual listbox a11y -
    // a deferred focus grab is what turns that into "the search box is already active" instead.
    useEffect(() => {
        if (!isOpen) {
            return;
        }
        const handle = requestAnimationFrame(() => inputRef.current?.focus());
        return () => cancelAnimationFrame(handle);
    }, [isOpen, selectedKeys]);

    // The shared "list of labeled things" chip look (matches TraitsInput) - only used when the caller
    // hasn't supplied its own renderSelected (eg. userSelect's avatar rows stay fully custom).
    const defaultRenderSelected = (selectedItems: T[]) => (
        <div className={classNames("flex flex-wrap gap-1", !isCompact && "py-1")}>
            {selectedItems.map((item) => {
                const key = getKey(item);
                return (
                    <Chip
                        key={key}
                        variant="flat"
                        color={getChipColor?.(item) ?? "default"}
                        className={classNames("rounded-sm p-0 pr-0.5 border-1 border-content2", chipClassName)}
                        onClose={() => onSelectionChange(new Set(selectedKeys.filter((k) => k !== key)))}
                    >
                        {getChipLabel!(item)}
                    </Chip>
                );
            })}
        </div>
    );

    const handleSelectionChange = (keys: SharedSelection) => {
        // Picking a result clears the search so the next keystroke starts fresh, unless the caller
        // wants to keep browsing the same result set (eg. picking several matches for one term).
        if (!keepSearchOnSelect) {
            onSearchChange("");
        }
        if (keys === "all") {
            onSelectionChange(keys);
            return;
        }
        onSelectionChange(new Set([...keys].filter((key) => key !== SENTINEL_KEY)));
    };

    const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            releaseFocusGuard();
        }
        if (e.key === "Enter" && onCreate && term) {
            // Stops a surrounding form taking Enter as a submit
            e.preventDefault();
            // The listbox picks a highlighted item; with nothing to pick, the text is a new one
            const hasMatch = items.some((item) => !selectedKeys.includes(getKey(item)) && !isHidden(item));
            if (!hasMatch) {
                e.stopPropagation();
                onCreate(term);
                onSearchChange("");
                return;
            }
        }
        // Keys the listbox is entitled to while the search field has focus - everything
        // else is editing the term
        if (!["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(e.key)) {
            e.stopPropagation();
        }
    };

    // onPointerDown stops HeroUI's own trigger toggle from fighting our controlled isOpen; onKeyDown
    // stops typed characters from bubbling into HeroUI's listbox "type to select" handling.
    const renderValue = (selected: { data?: T | null }[]) => {
        const selectedItems = selected.map((s) => s.data).filter((s): s is T => s != null && s !== sentinel);
        return (
            <div
                className={classNames("flex flex-wrap items-center gap-1 w-full cursor-text", !isCompact && "py-1")}
                onPointerDown={(e) => {
                    e.stopPropagation();
                    inputRef.current?.focus();
                    setIsOpen(true);
                }}
            >
                {!hideChipsInInput &&
                    (renderSelected ?? (getChipLabel ? defaultRenderSelected : undefined))?.(selectedItems)}
                <input
                    ref={inputRef}
                    aria-label={label ? `${label} search` : "Search"}
                    value={search}
                    onChange={(e) => {
                        guardFocus();
                        onSearchChange(e.target.value);
                        setIsOpen(true);
                    }}
                    onKeyDown={onInputKeyDown}
                    placeholder={hideChipsInInput || selectedItems.length === 0 ? placeholder : undefined}
                    className="flex-1 min-w-[80px] bg-transparent outline-none text-foreground mx-1"
                />
                {search && (
                    <button
                        type="button"
                        aria-label="Clear search"
                        className="shrink-0 cursor-pointer"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSearchChange("");
                            inputRef.current?.focus();
                        }}
                    >
                        <FontAwesomeIcon icon={faXmarkCircle} className="text-default-400" />
                    </button>
                )}
            </div>
        );
    };

    return (
        <Select
            label={label}
            aria-label={ariaLabel ?? label ?? "Search select"}
            size={size}
            radius={radius}
            variant={variant}
            selectionMode="multiple"
            isMultiline
            items={collectionItems}
            isVirtualized
            scrollRef={scrollRef}
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            isLoading={isLoading}
            isDisabled={isDisabled}
            selectedKeys={selectedKeysWithSentinel}
            renderValue={renderValue}
            onSelectionChange={handleSelectionChange}
            isClearable={selectedKeys.length > 0}
            onClear={() => onSelectionChange(new Set())}
            classNames={isCompact ? { trigger: "min-h-9 px-2 py-1" } : undefined}
            className={className}
            style={style}
        >
            {(item) =>
                item === sentinel ? (
                    <SelectItem key={SENTINEL_KEY} textValue="" className="hidden" aria-hidden="true" />
                ) : (
                    <SelectItem
                        key={getKey(item)}
                        className={classNames(isHidden(item) && "hidden", itemClassName)}
                        classNames={ITEM_CLASS_NAMES}
                    >
                        {renderItem(item)}
                    </SelectItem>
                )
            }
        </Select>
    );
}

type SearchableMultiSelectProps<T> = Omit<BaseElementProps, "children"> & {
    label?: string;
    /** Names the field where there is no room for a visible label */
    ariaLabel?: string;
    size?: SelectProps["size"];
    /** Independent of `size` - `isMultiline` mode decouples radius from size too, so pass this
     *  explicitly to keep rounded corners matching a sibling field. */
    radius?: SelectProps["radius"];
    variant?: SelectProps["variant"];
    placeholder?: string;
    items: T[];
    getKey: (item: T) => string;
    /** Whether an item survives the current search. Without it the list is left to the server alone */
    matches?: (item: T, search: string) => boolean;
    renderItem: (item: T) => ReactNode;
    /** Not called at all when `hideChipsInInput` is set - a caller showing selections elsewhere doesn't need it */
    renderSelected?: (items: T[]) => ReactNode;
    /** Enables the shared default chip UI in place of `renderSelected`, showing this label per selected
     *  item with its own remove (x). Leave unset for a caller needing custom chip content. */
    getChipLabel?: (item: T) => ReactNode;
    /** The colour of each default chip. Only applies alongside `getChipLabel`. */
    getChipColor?: (item: T) => UIColor;
    /** Extra classes merged onto each default chip - eg. "uppercase tracking-wide" for a tag list.
     *  Only applies alongside `getChipLabel`; a custom `renderSelected` owns its own styling. */
    chipClassName?: string;
    /** Keeps the field a pure search-and-pick control with no inline chips, for a caller that
     *  renders the selection itself somewhere else (eg. above the field) */
    hideChipsInInput?: boolean;
    /** Keeps the typed term after picking a result, so the same search can pick several matches in a row */
    keepSearchOnSelect?: boolean;
    selectedKeys: string[];
    onSelectionChange: (keys: SharedSelection) => void;
    search: string;
    onSearchChange: (value: string) => void;
    hasMore: boolean;
    onLoadMore: () => void;
    /** Pressing enter on text matching nothing offered hands it here, to be added as an item of its own */
    onCreate?: (text: string) => void;
    /** Tightens the padding around the chips and the search, for a field which sits among many */
    isCompact?: boolean;
    /** Extra classes on each option in the dropdown */
    itemClassName?: string;
    isLoading?: boolean;
    isDisabled?: boolean;
};

export default SearchableMultiSelect;
