import { memo, useMemo, useState } from "react";
import { Input } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { AnimatePresence, motion } from "framer-motion";
import classNames from "classnames";
import { TagKind } from "common/designGuidelines/suggestionTags";
import { BaseElementProps } from "../../types";
import TagChip from "./tagChip";
import AutoAddedMark from "./autoAddedMark";
import { EASE_STANDARD } from "../../constants";
import { containsAllWords } from "../../utils";

const ROW_TRANSITION = { duration: 0.2, ease: EASE_STANDARD } as const;

export interface SearchTagOption {
    id: string;
    label: string;
    description: string;
    /** Hidden search targets as well as the coloured chips shown on the row itself */
    aspects: string[];
    archetypes: string[];
}

/** Search + tag picker for a small fixed taxonomy - too many options (30+) to browse cold via a plain
 *  Select. A checked row floats to the top as the "selection" rather than duplicating into a chip row. */
const SearchTagPicker = memo(function SearchTagPicker({
    className,
    style,
    options,
    value,
    onChange,
    aspectKind,
    marks,
    isDisabled,
    placeholder = "Search…"
}: SearchTagPickerProps) {
    const [query, setQuery] = useState("");

    const filtered = useMemo(
        () =>
            options.filter((o) => {
                const haystack = [o.label, ...o.archetypes, ...o.aspects].join(" ");
                return containsAllWords(haystack, query);
            }),
        [options, query]
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
            <Input
                size="sm"
                placeholder={placeholder}
                value={query}
                onValueChange={setQuery}
                isDisabled={isDisabled}
                startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="text-foreground/40" />}
            />
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
                                <span className="flex min-w-0 flex-col">
                                    <span className="flex items-center gap-1.5 text-sm font-medium">
                                        {option.label}
                                        {isOn && marks?.[option.id] && <AutoAddedMark keywords={marks[option.id]} />}
                                    </span>
                                    <span className="text-xs text-foreground/50">{option.description}</span>
                                </span>
                                {option.archetypes.length + option.aspects.length > 0 && (
                                    <span className="ml-auto flex max-w-[40%] shrink-0 flex-wrap justify-end gap-1">
                                        {option.archetypes.map((tag) => (
                                            <TagChip key={`archetype-${tag}`} tag={tag} kind="archetype" />
                                        ))}
                                        {option.aspects.map((tag) => (
                                            <TagChip key={`aspect-${tag}`} tag={tag} kind={aspectKind} />
                                        ))}
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
    /** What the options' aspects are called, and so which colour - aspects for rewards, drawbacks for downsides */
    aspectKind: TagKind;
    /** Selections the card text made rather than the designer: option id -> the keywords which added it */
    marks?: Record<string, string[]>;
    isDisabled?: boolean;
    placeholder?: string;
};

export default SearchTagPicker;
