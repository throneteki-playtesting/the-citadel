import { useMemo, useState } from "react";
import { SharedSelection } from "@heroui/react";
import classNames from "classnames";
import { TagKind } from "common/designGuidelines/suggestionTags";
import SearchableMultiSelect from "./searchableMultiSelect";
import TagChip from "../designGuidelines/tagChip";
import { tagColor } from "../designGuidelines/tagColors";

type KeyedOption = { key: string; label: string };

// Same search+chips pattern as cardFilterDrawer.tsx's MultiSelectField, generalised to id/label pairs
// so it also covers a tag list (not just bare strings).
function KeyedMultiSelectField({
    label,
    placeholder,
    options,
    value,
    onChange,
    uppercase,
    getKind,
    onCreate
}: KeyedMultiSelectFieldProps) {
    const [search, setSearch] = useState("");

    const items = useMemo(() => {
        const term = search.trim().toLowerCase();
        const filtered = term ? options.filter((option) => option.label.toLowerCase().includes(term)) : options;
        const missingSelected = options.filter(
            (option) => value.includes(option.key) && !filtered.some((f) => f.key === option.key)
        );
        return [...missingSelected, ...filtered];
    }, [options, search, value]);

    const handleSelectionChange = (keys: SharedSelection) => {
        onChange(keys === "all" ? items.map((item) => item.key) : ([...keys] as string[]));
    };

    return (
        <SearchableMultiSelect
            label={label}
            size="md"
            radius="sm"
            placeholder={placeholder}
            items={items}
            getKey={(item) => item.key}
            renderItem={(item) =>
                getKind ? (
                    <TagChip tag={item.label} kind={getKind(item.key)} size="md" />
                ) : (
                    <span className={classNames(uppercase && "uppercase")}>{item.label}</span>
                )
            }
            getChipLabel={(item) => <span className={classNames(uppercase && "uppercase")}>{item.label}</span>}
            getChipColor={getKind && ((item) => tagColor(getKind(item.key)))}
            selectedKeys={value}
            onSelectionChange={handleSelectionChange}
            search={search}
            onSearchChange={setSearch}
            hasMore={false}
            onLoadMore={() => undefined}
            onCreate={onCreate}
            isCompact={!!getKind}
            itemClassName={getKind && "py-2"}
        />
    );
}

type KeyedMultiSelectFieldProps = {
    label?: string;
    placeholder: string;
    options: KeyedOption[];
    value: string[];
    onChange: (value: string[]) => void;
    /** Tags are free-text phrases with no natural casing of their own - true for that field only. */
    uppercase?: boolean;
    /** Colours each option and chip by what kind of tag it is */
    getKind?: (key: string) => TagKind | undefined;
    /** Lets whatever is typed be added as an option of its own by pressing enter, when nothing offered matches it */
    onCreate?: (text: string) => void;
};

export default KeyedMultiSelectField;
