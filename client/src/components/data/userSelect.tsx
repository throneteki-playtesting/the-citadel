import { Avatar, SelectProps, SharedSelection } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { useGetUsersQuery } from "../../api";
import { useCallback, useMemo } from "react";
import { BaseElementProps } from "../../types";
import { User } from "common/models/auth";
import { fuzzyMatch } from "common/utils";
import usePaginatedUsers from "../../hooks/usePaginatedUsers";
import SearchableMultiSelect from "./searchableMultiSelect";

const BASE_FILTER = { discordId: { $ne: "anonymous" } };

const UserSelect = ({
    className,
    style,
    label,
    ariaLabel,
    size,
    variant,
    placeholder,
    selectedIds,
    isDisabled,
    onChange
}: UserSelectProps) => {
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
            ariaLabel={ariaLabel}
            size={size}
            variant={variant}
            placeholder={placeholder}
            isDisabled={isDisabled}
            items={allItems}
            getKey={(user) => user.discordId}
            matches={(user, term) => fuzzyMatch(term, user.displayname, user.username)}
            selectedKeys={selectedIds}
            onSelectionChange={handleSelectionChange}
            search={search}
            onSearchChange={setSearch}
            hasMore={hasMore}
            onLoadMore={handleLoadMore}
            isLoading={isLoading || isFetching}
            renderSelected={(users) =>
                users.map((user) => (
                    <RemovableUser
                        key={user.discordId}
                        user={user}
                        onRemove={() => onChange(selectedIds.filter((id) => id !== user.discordId))}
                    />
                ))
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

// The avatar itself is the remove button - a cross over it on hover, kept off the Select's own press handling
function RemovableUser({ user, onRemove }: { user: User; onRemove: () => void }) {
    return (
        <button
            type="button"
            aria-label={`Remove ${user.displayname}`}
            title={`Remove ${user.displayname}`}
            className="group relative shrink-0 rounded-full cursor-pointer"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
                e.stopPropagation();
                onRemove();
            }}
        >
            <Avatar size="sm" src={user.avatarUrl} alt={user.displayname} className="pointer-events-none" />
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <FontAwesomeIcon icon={faXmark} />
            </span>
        </button>
    );
}

type UserSelectProps = Omit<BaseElementProps, "children"> & {
    label?: string;
    /** Names the field where it is drawn without a visible label */
    ariaLabel?: string;
    size?: SelectProps["size"];
    variant?: SelectProps["variant"];
    placeholder?: string;
    selectedIds: string[];
    isDisabled?: boolean;
    onChange: (ids: string[]) => void;
};

export default UserSelect;
