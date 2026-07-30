import { Select, SelectItem, SharedSelection } from "@heroui/react";
import { useInfiniteScroll } from "@heroui/use-infinite-scroll";
import { ReactNode, useMemo, useRef, useState } from "react";
import { BaseElementProps } from "../../types";

const SENTINEL_KEY = "__searchable-select-sentinel__";

function SearchableMultiSelect<T extends object>({
    className,
    style,
    label,
    placeholder = "Search...",
    items,
    getKey,
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

    const handleSelectionChange = (keys: SharedSelection) => {
        if (keys === "all") {
            onSelectionChange(keys);
            return;
        }
        onSelectionChange(new Set([...keys].filter((key) => key !== SENTINEL_KEY)));
    };

    const renderValue = (selected: { data?: T | null }[]) => {
        const selectedItems = selected.map((s) => s.data).filter((s): s is T => s != null && s !== sentinel);
        return (
            <div
                className="flex flex-wrap items-center gap-1 w-full cursor-text"
                onPointerDown={(e) => {
                    // Prevent HeroUI's own trigger press-toggle from fighting our controlled isOpen below
                    e.stopPropagation();
                    inputRef.current?.focus();
                }}
            >
                {renderSelected(selectedItems)}
                <input
                    ref={inputRef}
                    aria-label={label ? `${label} search` : "Search"}
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onFocus={() => setIsOpen(true)}
                    placeholder={selectedItems.length === 0 ? placeholder : undefined}
                    className="flex-1 min-w-[80px] bg-transparent outline-none text-foreground mx-1"
                />
            </div>
        );
    };

    return (
        <Select
            label={label}
            aria-label={label ?? "Search select"}
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
                    <SelectItem key={getKey(item)} classNames={{ title: "min-w-0 overflow-hidden" }}>
                        {renderItem(item)}
                    </SelectItem>
                )
            }
        </Select>
    );
}

type SearchableMultiSelectProps<T> = Omit<BaseElementProps, "children"> & {
    label?: string;
    placeholder?: string;
    items: T[];
    getKey: (item: T) => string;
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
