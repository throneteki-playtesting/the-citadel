import { Avatar, Select, SelectItem, SharedSelection } from "@heroui/react";
import { useGetUsersQuery } from "../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BaseElementProps } from "../../types";
import { User } from "common/models/auth";

const UserSelect = ({ className, style, label = "Users", selectedIds, onChange }: UserSelectProps) => {
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<User[]>([]);
    const { data, isLoading, isFetching } = useGetUsersQuery({ filter: { discordId: { $ne: "anonymous" } }, page, perPage: 20 });
    const { data: selectedData } = useGetUsersQuery({ filter: { discordId: { $in: selectedIds } } }, { skip: selectedIds.length === 0 });

    useEffect(() => {
        if (data?.items) {
            setItems((prev) => [...prev, ...data.items]);
        }
    }, [data]);

    const allItems = useMemo(() => {
        const byId = new Map<string, User>();
        for (const user of [...items, ...(selectedData?.items ?? [])]) {
            byId.set(user.discordId, user);
        }
        return [...byId.values()];
    }, [items, selectedData]);

    const handleLoadMore = () => {
        const hasMore = items.length < (data?.total ?? 0);
        if (hasMore && !isFetching) {
            setPage((prev) => prev + 1);
        }
    };

    const handleSelectionChange = useCallback((keys: SharedSelection) => {
        if (keys === "all") {
            onChange(allItems.map((user) => user.discordId));
        } else {
            onChange(Array.from(keys).map((key) => key.toString()));
        }
    }, [allItems, onChange]);

    return (
        <Select
            label={label}
            selectionMode={"multiple"}
            isMultiline
            items={allItems}
            isVirtualized
            onLoadMore={handleLoadMore}
            isLoading={isLoading || isFetching}
            selectedKeys={selectedIds}
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

type UserSelectProps = Omit<BaseElementProps, "children"> & { label?: string, selectedIds: string[], onChange: (ids: string[]) => void }

export default UserSelect;
