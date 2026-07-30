import { Avatar, SharedSelection } from "@heroui/react";
import { useGetUsersQuery } from "../../api";
import { useCallback, useMemo } from "react";
import { BaseElementProps } from "../../types";
import { User } from "common/models/auth";
import usePaginatedUsers from "../../hooks/usePaginatedUsers";
import SearchableMultiSelect from "./searchableMultiSelect";

const BASE_FILTER = { discordId: { $ne: "anonymous" } };

const UserSelect = ({ className, style, label = "Users", selectedIds, onChange }: UserSelectProps) => {
    const { items, isLoading, isFetching, hasMore, handleLoadMore, search, setSearch } = usePaginatedUsers(BASE_FILTER);
    const { data: selectedData } = useGetUsersQuery(
        { filter: { discordId: { $in: selectedIds } } },
        { skip: selectedIds.length === 0 }
    );

    const allItems = useMemo(() => {
        const byId = new Map<string, User>();
        for (const user of [...items, ...(selectedData?.items ?? [])]) {
            byId.set(user.discordId, user);
        }
        return [...byId.values()];
    }, [items, selectedData]);

    const handleSelectionChange = useCallback(
        (keys: SharedSelection) => {
            if (keys === "all") {
                onChange(allItems.map((user) => user.discordId));
            } else {
                onChange(Array.from(keys).map((key) => key.toString()));
            }
        },
        [allItems, onChange]
    );

    return (
        <SearchableMultiSelect
            label={label}
            items={allItems}
            getKey={(user) => user.discordId}
            selectedKeys={selectedIds}
            onSelectionChange={handleSelectionChange}
            search={search}
            onSearchChange={setSearch}
            hasMore={hasMore}
            onLoadMore={handleLoadMore}
            isLoading={isLoading || isFetching}
            renderSelected={(users) =>
                users.map((user) => <Avatar key={user.discordId} size="sm" src={user.avatarUrl} />)
            }
            renderItem={(user) => (
                <div className="flex gap-2 items-center w-full min-w-0">
                    <Avatar alt={user.displayname} className="shrink-0" size="sm" src={user.avatarUrl} />
                    <div className="flex flex-1 flex-col min-w-0">
                        <span className="block w-full truncate text-small">{user.displayname}</span>
                        <span className="block w-full truncate text-tiny text-default-400">{user.username}</span>
                    </div>
                </div>
            )}
            className={className}
            style={style}
        />
    );
};

type UserSelectProps = Omit<BaseElementProps, "children"> & {
    label?: string;
    selectedIds: string[];
    onChange: (ids: string[]) => void;
};

export default UserSelect;
