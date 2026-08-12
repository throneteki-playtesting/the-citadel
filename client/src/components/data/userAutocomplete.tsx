import { useMemo } from "react";
import { Autocomplete, AutocompleteItem, AutocompleteProps, Avatar } from "@heroui/react";
import { useGetUsersQuery } from "../../api";
import usePaginatedUsers from "../../hooks/usePaginatedUsers";
import { BaseElementProps } from "../../types";

const BASE_FILTER = { discordId: { $ne: "anonymous" } };

// One person, picked by discord id - paged and searched server-side, with whoever is currently selected
// fetched by id alongside it since a saved choice may sit outside the loaded page
export default function UserAutocomplete({
    className,
    style,
    label,
    placeholder,
    size,
    variant,
    selectedId,
    isDisabled,
    onChange
}: UserAutocompleteProps) {
    const { items, isLoading, search, setSearch } = usePaginatedUsers(BASE_FILTER);
    const { data: selectedData } = useGetUsersQuery({ filter: { discordId: selectedId } }, { skip: !selectedId });

    const users = useMemo(() => {
        const byId = new Map((selectedData?.items ?? []).map((user) => [user.discordId, user]));
        for (const user of items) {
            byId.set(user.discordId, user);
        }
        return [...byId.values()];
    }, [items, selectedData?.items]);

    const selected = users.find((user) => user.discordId === selectedId);

    return (
        <Autocomplete
            label={label}
            placeholder={placeholder}
            size={size}
            variant={variant}
            className={className}
            style={style}
            isLoading={isLoading}
            isDisabled={isDisabled}
            isClearable={false}
            items={users}
            inputValue={selected && search.length === 0 ? selected.displayname : search}
            onInputChange={setSearch}
            selectedKey={selectedId ?? null}
            onSelectionChange={(key) => {
                setSearch("");
                onChange(key ? String(key) : undefined);
            }}
        >
            {(user) => (
                <AutocompleteItem
                    key={user.discordId}
                    textValue={user.displayname}
                    classNames={{ base: "min-w-0", title: "min-w-0" }}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <Avatar size="sm" src={user.avatarUrl} alt={user.displayname} className="shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{user.displayname}</span>
                    </div>
                </AutocompleteItem>
            )}
        </Autocomplete>
    );
}

type UserAutocompleteProps = Omit<BaseElementProps, "children"> & {
    label?: string;
    placeholder?: string;
    size?: AutocompleteProps["size"];
    variant?: AutocompleteProps["variant"];
    selectedId?: string;
    isDisabled?: boolean;
    onChange: (discordId?: string) => void;
};
