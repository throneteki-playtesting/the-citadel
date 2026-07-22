import { Avatar, SharedSelection } from "@heroui/react";
import { useCallback } from "react";
import { BaseElementProps } from "../../types";
import { User } from "common/models/auth";
import usePaginatedUsers from "../../hooks/usePaginatedUsers";
import SearchableMultiSelect from "./searchableMultiSelect";

const UserFilter = ({ className, style, label = "Users", setUsers, users = [] }: UserFilterProps) => {
    const { items, isLoading, isFetching, hasMore, handleLoadMore, search, setSearch } = usePaginatedUsers();

    const handleSelectionChange = useCallback((keys: SharedSelection) => {
        if (keys === "all") {
            setUsers(items);
        } else {
            setUsers(
                items.filter((user) =>
                    Array.from(keys).includes(user.discordId)
                )
            );
        }
    }, [items, setUsers]);

    return (
        <SearchableMultiSelect
            label={label}
            items={items}
            getKey={(user) => user.discordId}
            selectedKeys={users.map((user) => user.discordId)}
            onSelectionChange={handleSelectionChange}
            search={search}
            onSearchChange={setSearch}
            hasMore={hasMore}
            onLoadMore={handleLoadMore}
            isLoading={isLoading || isFetching}
            renderSelected={(selected) => selected.map((user) => (
                <Avatar key={user.discordId} size="sm" src={user.avatarUrl}/>
            ))}
            renderItem={(user) => (
                <div className="flex gap-2 items-center w-full min-w-0">
                    <Avatar alt={user.displayname} className="shrink-0" size="sm" src={user.avatarUrl}/>
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

type UserFilterProps = Omit<BaseElementProps, "children"> & { label?: string, setUsers: (users: User[]) => void, users?: User[] }

export default UserFilter;
