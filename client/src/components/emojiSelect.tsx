import { dismoji } from "../constants";
import { useMemo, useState } from "react";
import { Autocomplete, AutocompleteItem, AutocompleteProps } from "@heroui/react";

const ALL_EMOJIS = Object.entries(dismoji).map(([name, unicode]) => ({ name, unicode }));

export function EmojiSelect({ defaultValue, name = "emoji", label = "Emoji", ...props }: EmojiSelectProps) {
    const [search, setSearch] = useState(defaultValue ? (dismoji[defaultValue] ?? defaultValue) : "");
    const [selectedKey, setSelectedKey] = useState<string | null>(defaultValue ?? null);

    const filtered = useMemo(() => {
        if (selectedKey) return ALL_EMOJIS.filter((e) => e.name === selectedKey);
        if (search.length < 2) return ALL_EMOJIS.slice(0, 100);
        return ALL_EMOJIS.filter((e) => e.name.includes(search.toLowerCase())).slice(0, 100);
    }, [search, selectedKey]);

    const handleInputChange = (value: string) => {
        setSearch(value);
        setSelectedKey(null);
    };

    const handleSelectionChange = (key: React.Key | null) => {
        const emojiName = key as string | null;
        setSelectedKey(emojiName);
        if (emojiName) setSearch(dismoji[emojiName] ?? emojiName);
    };

    return (
        <>
            <input type="hidden" name={name} value={selectedKey ?? ""} />
            <Autocomplete
                label={label}
                selectedKey={selectedKey}
                inputValue={search}
                onInputChange={handleInputChange}
                onSelectionChange={handleSelectionChange}
                items={filtered}
                allowsCustomValue={false}
                {...props}
            >
                {(item) => (
                    <AutocompleteItem key={item.name} textValue={item.name}>
                        <span className="flex items-center gap-2">
                            <span className="text-xl">{item.unicode}</span>
                            <span>{item.name}</span>
                        </span>
                    </AutocompleteItem>
                )}
            </Autocomplete>
        </>
    );
}

type EmojiSelectProps = Omit<AutocompleteProps<{ name: string; unicode: string }>, "children" | "items" | "inputValue" | "onInputChange" | "allowsCustomValue" | "defaultSelectedKey"> & {
    defaultValue?: string;
};