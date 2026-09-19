import { memo, useMemo, useState } from "react";
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Input } from "@heroui/react";
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

/** Search + tag picker for a small fixed taxonomy - not a plain Select, since 30+ options is too
 *  many to browse cold. Memoized (its rows carry a `layout` animation); needs stable value/onChange.
 *  A checked row is the "selection", so it reads that way directly - floated to the top of the list
 *  rather than duplicated into a separate chip row above it. Unchecking drops it back to wherever it
 *  naturally sorts among the rest, and `layout` animates both moves. */
const SearchTagPicker = memo(function SearchTagPicker({
    className,
    style,
    options,
    value,
    onChange,
    isDisabled,
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

    // Checked rows float to the top, in check order (`value` grows by appending - see toggleValue).
    const ordered = useMemo(
        () =>
            [...filtered].sort((a, b) => {
                const aOn = value.includes(a.id);
                const bOn = value.includes(b.id);
                if (aOn && bOn) {
                    return value.indexOf(a.id) - value.indexOf(b.id);
                }
                return Number(bOn) - Number(aOn);
            }),
        [filtered, value]
    );
    const checkedCount = useMemo(() => ordered.filter((o) => value.includes(o.id)).length, [ordered, value]);
    const showDivider = checkedCount > 0 && checkedCount < ordered.length;

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
            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto rounded-lg border border-content3 p-1">
                {ordered.length === 0 && <div className="p-3 text-xs text-foreground/50">No matches.</div>}
                <AnimatePresence initial={false} mode="popLayout">
                    {ordered.flatMap((option, index) => {
                        const isOn = value.includes(option.id);
                        const rows = [];
                        // Between the checked group and the rest - only meaningful once both groups
                        // are non-empty, and `layout` carries it along as either group's size changes.
                        if (showDivider && index === checkedCount) {
                            rows.push(
                                <motion.div
                                    key="__divider"
                                    layout
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={ROW_TRANSITION}
                                    className="my-1 h-px shrink-0 bg-content3"
                                />
                            );
                        }
                        rows.push(
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
                        return rows;
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
    placeholder?: string;
};

export default SearchTagPicker;
