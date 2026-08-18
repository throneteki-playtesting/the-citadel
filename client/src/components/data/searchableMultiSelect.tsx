import { Select, SelectItem, SelectProps, SharedSelection } from "@heroui/react";
import { useInfiniteScroll } from "@heroui/use-infinite-scroll";
import { ReactNode, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import { BaseElementProps } from "../../types";

const SENTINEL_KEY = "__searchable-select-sentinel__";

function SearchableMultiSelect<T extends object>({
    className,
    style,
    label,
    ariaLabel,
    size,
    variant,
    placeholder = "Search...",
    items,
    getKey,
    matches,
    renderItem,
    renderSelected,
    selectedKeys,
    onSelectionChange,
    search,
    onSearchChange,
    hasMore,
    onLoadMore,
    isLoading,
    isDisabled
}: SearchableMultiSelectProps<T>) {
    const [isOpen, setIsOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [, scrollRef] = useInfiniteScroll({ hasMore, isEnabled: isOpen, shouldUseLoader: false, onLoadMore });
    const sentinel = useRef({} as T).current;

    const collectionItems = useMemo(() => [...items, sentinel], [items, sentinel]);
    const selectedKeysWithSentinel = useMemo(() => [...selectedKeys, SENTINEL_KEY], [selectedKeys]);

    const term = search.trim();
    const isHidden = (item: T) => term.length > 0 && !!matches && !matches(item, term);

    const handleSelectionChange = (keys: SharedSelection) => {
        // Picking a result clears the search so the next keystroke starts a fresh search
        // rather than continuing to filter against what was just typed
        onSearchChange("");
        if (keys === "all") {
            onSelectionChange(keys);
            return;
        }
        onSelectionChange(new Set([...keys].filter((key) => key !== SENTINEL_KEY)));
    };

    // onPointerDown stops HeroUI's own trigger toggle from fighting our controlled isOpen; onKeyDown
    // stops typed characters from bubbling into HeroUI's listbox "type to select" handling.
    const renderValue = (selected: { data?: T | null }[]) => {
        const selectedItems = selected.map((s) => s.data).filter((s): s is T => s != null && s !== sentinel);
        return (
            <div
                className="flex flex-wrap items-center gap-1 w-full cursor-text"
                onPointerDown={(e) => {
                    e.stopPropagation();
                    inputRef.current?.focus();
                    setIsOpen(true);
                }}
            >
                {renderSelected(selectedItems)}
                <input
                    ref={inputRef}
                    aria-label={label ? `${label} search` : "Search"}
                    value={search}
                    onChange={(e) => {
                        onSearchChange(e.target.value);
                        setIsOpen(true);
                    }}
                    onKeyDown={(e) => {
                        // Keys the listbox is entitled to while the search field has focus - everything
                        // else is editing the term
                        if (!["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(e.key)) {
                            e.stopPropagation();
                        }
                    }}
                    placeholder={selectedItems.length === 0 ? placeholder : undefined}
                    className="flex-1 min-w-[80px] bg-transparent outline-none text-foreground mx-1"
                />
            </div>
        );
    };

    return (
        <Select
            label={label}
            aria-label={ariaLabel ?? label ?? "Search select"}
            size={size}
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
            className={className}
            style={style}
        >
            {(item) =>
                item === sentinel ? (
                    <SelectItem key={SENTINEL_KEY} textValue="" className="hidden" aria-hidden="true" />
                ) : (
                    <SelectItem
                        key={getKey(item)}
                        className={classNames(isHidden(item) && "hidden")}
                        classNames={{ title: "min-w-0 overflow-hidden" }}
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
    variant?: SelectProps["variant"];
    placeholder?: string;
    items: T[];
    getKey: (item: T) => string;
    /** Whether an item survives the current search. Without it the list is left to the server alone */
    matches?: (item: T, search: string) => boolean;
    renderItem: (item: T) => ReactNode;
    renderSelected: (items: T[]) => ReactNode;
    selectedKeys: string[];
    onSelectionChange: (keys: SharedSelection) => void;
    search: string;
    onSearchChange: (value: string) => void;
    hasMore: boolean;
    onLoadMore: () => void;
    isLoading?: boolean;
    isDisabled?: boolean;
};

export default SearchableMultiSelect;
