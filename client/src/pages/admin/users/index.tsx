import { Button, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow, User as DisplayUser, Pagination, Input, Spinner } from "@heroui/react";
import { useGetUsersQuery } from "../../../api";
import { Key, useCallback, useMemo, useState } from "react";
import Permission from "common/models/permissions";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faPencil, faXmarkCircle } from "@fortawesome/free-solid-svg-icons";
import EditUserModal from "./editUserModal";
import Loading from "../../../components/loading";
import { User } from "common/models/auth";
import usePageTitle from "../../../hooks/usePageTitle";
import { usePermission } from "../../../hooks/usePermission";
import useTimezone from "../../../hooks/useTimezone";
import { Filter } from "common/types";
import classNames from "classnames";

export default function Users() {
    usePageTitle("Users");

    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const perPage = 10;
    const filter = useMemo<Filter<User>[]>(() => {
        const searchRegex = `(?i)${search}`;

        return [
            { displayname: { $regex: searchRegex } },
            { username: { $regex: searchRegex } }
        ];
    }, [search]);
    const { data: usersData, isLoading, isFetching } = useGetUsersQuery({ filter, page, perPage });

    // Reset to page 1 when search changes
    const handleSearch = (value: string) => {
        setSearch(value);
        setPage(1);
    };

    const [editingUser, setEditingUser] = useState<User>();

    const canEdit = usePermission(Permission.EDIT_USERS);
    const { format } = useTimezone();

    const columns = [
        { key: "username", label: "Name" },
        { key: "roles", label: "Roles" },
        { key: "lastLogin", label: "Last Login", className: "max-sm:hidden" },
        { key: "actions", label: "" }
    ] as { key: string; label: string; className?: string }[];

    const renderCell = useCallback((user: User, columnKey: Key) => {
        switch (columnKey) {
            case "username":
                return (
                    <DisplayUser
                        avatarProps={{ radius: "lg", src: user.avatarUrl }}
                        description={user.username}
                        name={user.displayname}
                    >
                        {user.discordId}
                    </DisplayUser>
                );
            case "roles":
                return (
                    <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => {
                            const hex = role.color ? `#${role.color.toString(16).padStart(6, "0")}` : undefined;
                            return (
                                <div
                                    key={role.discordId}
                                    className={classNames("border py-1 px-2 rounded-md text-sm", { "border-content3": !hex })}
                                    style={hex ? { backgroundColor: `${hex}33`, borderColor: `${hex}66`, color: hex } : undefined}
                                >
                                    {role.name}
                                </div>
                            );
                        })}
                    </div>
                );
            case "lastLogin":
                return <span>{user.lastLogin ? format(user.lastLogin) : "Never"}</span>;
            case "actions":
                return canEdit ? (
                    <Button isIconOnly size="sm" variant="light" isDisabled={!!editingUser} onPress={() => setEditingUser(user)}>
                        <FontAwesomeIcon icon={faPencil} />
                    </Button>
                ) : null;
        }
    }, [canEdit, editingUser, format]);

    return (
        <div className="space-y-2">
            <div className="font-cinzel text-2xl">Citadel Users</div>
            <div className="text-sm md:text-base">User data is synced with Discord, prioritising the linked discord server information.</div>
            <div className="text-sm md:text-base">You may edit user permissions at a granular level here, or at a broader level via the Roles page.</div>
            <Table
                topContent={
                    <Input
                        placeholder="Search..."
                        value={search}
                        onValueChange={handleSearch}
                        startContent={<FontAwesomeIcon icon={faMagnifyingGlass}/>}
                        endContent={
                            isFetching ? (
                                <Spinner size="sm" aria-label="Loading" />
                            ) : search ? (
                                <button onClick={() => handleSearch("")}>
                                    <FontAwesomeIcon icon={faXmarkCircle} className="text-default-400" />
                                </button>
                            ) : null
                        }
                        className="max-w-98"
                    />
                }
                bottomContent={
                    <Pagination page={page} onChange={setPage} total={Math.ceil((usersData?.total ?? 0) / perPage)} />
                }
            >
                <TableHeader columns={columns}>
                    {(column) => (
                        <TableColumn key={column.key} className={column.className}>
                            {column.label}
                        </TableColumn>
                    )}
                </TableHeader>
                <TableBody emptyContent="No users from discord server have logged into site" items={usersData?.items ?? []} isLoading={isLoading} loadingContent={<Loading />}>
                    {(item) => (
                        <TableRow key={item.username}>
                            {(columnKey) => {
                                const column = columns.find((c) => c.key === columnKey);
                                return <TableCell className={column?.className}>{renderCell(item, columnKey)}</TableCell>;
                            }}
                        </TableRow>
                    )}
                </TableBody>
            </Table>
            <EditUserModal user={editingUser} onOpenChange={() => setEditingUser(undefined)} />
        </div>
    );
};
