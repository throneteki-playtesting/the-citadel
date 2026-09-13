import { memo, useMemo, useState } from "react";
import { Button, Chip, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Input } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faFilter, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { AnimatePresence, motion } from "framer-motion";
import classNames from "classnames";
import { BaseElementProps } from "../../types";
import { EASE_STANDARD } from "../../constants";

const ROW_TRANSITION = { duration: 0.2, ease: EASE_STANDARD } as const;

export interface SearchTagOption {
    id: string;
    label: string;
    description: string;
    categories?: string[];
    /** hidden synonyms the search also matches against - never rendered */
    tags?: string[];
}

/** Simple ordered-subsequence match - lets "bounce" find an option whose label never says "bounce" */
function fuzzyMatch(text: string, query: string) {
    const t = text.toLowerCase();
    const q = query.toLowerCase().trim();
    if (!q) {
        return true;
    }
    let ti = 0;
    for (const c of q) {
        if (c === " ") {
            continue;
        }
        ti = t.indexOf(c, ti);
        if (ti === -1) {
            return false;
        }
        ti++;
    }
    return true;
}

/** "cardAdvantage" -> "Card Advantage" - the registry's ids are camelCase keys, not display labels */
function categoryLabel(category: string) {
    const spaced = category.replace(/([a-z])([A-Z])/g, "$1 $2");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The chips for whatever's currently selected, pulled out of `SearchTagPicker` so a caller can
 *  place them somewhere the picker's own search/list doesn't reach (eg. outside a collapsed section). */
export function SelectedTagChips({
    className,
    style,
    options,
    value,
    onChange,
    isDisabled,
    emptyLabel
}: SelectedTagChipsProps) {
    if (value.length === 0) {
        // `min-h-6` matches a `size="sm"` Chip's own height, so the section reads the same height
        // whether or not anything's selected, growing only once chips wrap onto a second line.
        return emptyLabel ? (
            <span
                className={classNames("flex min-h-6 items-center text-xs text-foreground/40", className)}
                style={style}
            >
                {emptyLabel}
            </span>
        ) : null;
    }
    return (
        <div className={classNames("flex min-h-6 flex-wrap items-center gap-1", className)} style={style}>
            <AnimatePresence initial={false}>
                {value.map((id) => {
                    const option = options.find((o) => o.id === id);
                    return (
                        <motion.div
                            key={id}
                            layout
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={ROW_TRANSITION}
                        >
                            <Chip
                                size="sm"
                                radius="sm"
                                color="primary"
                                variant="flat"
                                onClose={isDisabled ? undefined : () => onChange(value.filter((v) => v !== id))}
                            >
                                {option?.label ?? id}
                            </Chip>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}

type SelectedTagChipsProps = Omit<BaseElementProps, "children"> & {
    options: SearchTagOption[];
    value: string[];
    onChange: (value: string[]) => void;
    isDisabled?: boolean;
    /** shown in place of the chip row when nothing is selected, eg. "No rewards selected." */
    emptyLabel?: string;
};

/** Search + tag picker for a small fixed taxonomy - not a plain Select, since 30+ options is too
 *  many to browse cold. Memoized (its rows carry a `layout` animation); needs stable value/onChange. */
const SearchTagPicker = memo(function SearchTagPicker({
    className,
    style,
    options,
    value,
    onChange,
    isDisabled,
    showChips = true,
    placeholder = "Search…"
}: SearchTagPickerProps) {
    const [query, setQuery] = useState("");
    const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());

    const categories = useMemo(() => [...new Set(options.flatMap((o) => o.categories ?? []))], [options]);

    const filtered = useMemo(
        () =>
            options.filter((o) => {
                if (activeCategories.size > 0 && !(o.categories ?? []).some((c) => activeCategories.has(c))) {
                    return false;
                }
                const haystack = [o.label, ...(o.categories ?? []), ...(o.tags ?? [])].join(" ");
                return fuzzyMatch(haystack, query);
            }),
        [options, query, activeCategories]
    );

    const toggleValue = (id: string) => {
        onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
    };

    return (
        <div className={classNames("flex flex-col gap-2", className)} style={style}>
            <div className="flex gap-2">
                <Input
                    size="sm"
                    className="flex-[2]"
                    placeholder={placeholder}
                    value={query}
                    onValueChange={setQuery}
                    isDisabled={isDisabled}
                    startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="text-foreground/40" />}
                />
                {categories.length > 0 && (
                    <Dropdown>
                        <DropdownTrigger>
                            <Button
                                size="sm"
                                variant="flat"
                                className="relative shrink-0 px-0 w-10 sm:w-auto sm:flex-1 sm:px-3"
                                isDisabled={isDisabled}
                                aria-label="Filter by category"
                            >
                                <FontAwesomeIcon icon={faFilter} />
                                <span className="hidden sm:inline">Categories</span>
                                {activeCategories.size > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 sm:static px-1.5 text-xs tabular-nums rounded-full bg-foreground/10">
                                        {activeCategories.size}
                                    </span>
                                )}
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label="Filter by category"
                            selectionMode="multiple"
                            closeOnSelect={false}
                            selectedKeys={activeCategories}
                            onSelectionChange={(keys) => setActiveCategories(new Set(keys as Set<string>))}
                        >
                            {categories.map((category) => (
                                <DropdownItem key={category}>{categoryLabel(category)}</DropdownItem>
                            ))}
                        </DropdownMenu>
                    </Dropdown>
                )}
            </div>
            {showChips && (
                <AnimatePresence initial={false}>
                    {value.length > 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={ROW_TRANSITION}
                            className="overflow-hidden"
                        >
                            <SelectedTagChips
                                options={options}
                                value={value}
                                onChange={onChange}
                                isDisabled={isDisabled}
                                className="pb-0.5"
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            )}
            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto rounded-lg border border-content3 p-1">
                {filtered.length === 0 && <div className="p-3 text-xs text-foreground/50">No matches.</div>}
                <AnimatePresence initial={false} mode="popLayout">
                    {filtered.map((option) => {
                        const isOn = value.includes(option.id);
                        return (
                            <motion.button
                                type="button"
                                layout
                                key={option.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={ROW_TRANSITION}
                                disabled={isDisabled}
                                onClick={() => toggleValue(option.id)}
                                className={classNames(
                                    "w-full flex items-start gap-2 px-2 py-2 rounded-md text-left transition-colors",
                                    isDisabled ? "cursor-default" : "cursor-pointer",
                                    isOn ? "bg-primary/10" : "hover:bg-content2"
                                )}
                            >
                                <span
                                    className={classNames(
                                        "mt-0.5 w-4 h-4 flex items-center justify-center rounded border shrink-0 text-[0.6rem]",
                                        isOn ? "bg-primary border-primary text-primary-foreground" : "border-content4"
                                    )}
                                >
                                    {isOn && <FontAwesomeIcon icon={faCheck} />}
                                </span>
                                <span className="flex flex-col">
                                    <span className="text-sm font-medium">{option.label}</span>
                                    <span className="text-xs text-foreground/50">{option.description}</span>
                                </span>
                                {option.categories && option.categories.length > 0 && (
                                    <span className="ml-auto text-xxs uppercase tracking-wide text-foreground/40 shrink-0">
                                        {categoryLabel(option.categories[0])}
                                    </span>
                                )}
                            </motion.button>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>
    );
});

type SearchTagPickerProps = Omit<BaseElementProps, "children"> & {
    options: SearchTagOption[];
    value: string[];
    onChange: (value: string[]) => void;
    isDisabled?: boolean;
    /** false when a caller renders `SelectedTagChips` separately - see editSuggestionModal.tsx */
    showChips?: boolean;
    placeholder?: string;
};

export default SearchTagPicker;
