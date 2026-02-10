import { Avatar, Select, SelectItem, SharedSelection } from "@heroui/react";
import { User } from "common/models/user";
import { useGetUsersQuery } from "../../api";
import { useCallback, useEffect, useState } from "react";
import { BaseElementProps } from "../../types";

const UserFilter = ({ className, style, label = "Users", setUsers, users = [] }: UserFilterProps) => {
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<User[]>([]);
    const { data, isLoading, isFetching } = useGetUsersQuery({ page, perPage: 20 });

    useEffect(() => {
        if (data?.items) {
            setItems((prev) => [...prev, ...data.items]);
        }
    }, [data]);

    const handleLoadMore = () => {
        const hasMore = items.length < (data?.total ?? 0);
        if (hasMore && !isFetching) {
            setPage((prev) => prev + 1);
        }
    };

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
        <Select
            label={label}
            selectionMode={"multiple"}
            isMultiline
            items={items}
            isVirtualized
            onLoadMore={handleLoadMore}
            isLoading={isLoading || isFetching}
            selectedKeys={users.map((user) => user.discordId)}
            renderValue={(items) => <div className="flex gap-1">
                {items.map((item) => (
                    <Avatar key={item.data?.discordId} size="sm" src={item.data?.avatarUrl}/>
                ))}
            </div>}
            onSelectionChange={handleSelectionChange}
            className={className}
            style={style}
        >
            {(user) => (
                <SelectItem key={user.discordId}>
                    <div className="flex gap-2 items-center">
                        <Avatar alt={user.displayname} className="shrink-0" size="sm" src={user.avatarUrl}/>
                        <div className="flex flex-col">
                            <span className="text-small">{user.displayname}</span>
                            <span className="text-tiny text-default-400">{user.username}</span>
                        </div>
                    </div>
                </SelectItem>
            )}
        </Select>
    );
};

type UserFilterProps = Omit<BaseElementProps, "children"> & { label?: string, setUsers: (users: User[]) => void, users?: User[] }

export default UserFilter;