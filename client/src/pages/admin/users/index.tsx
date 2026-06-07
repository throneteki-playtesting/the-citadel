import { Button, Chip, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow, User as DisplayUser, Link, Pagination } from "@heroui/react";
import { useGetUsersQuery } from "../../../api";
import { Key, useCallback, useState } from "react";
import Permission from "common/models/permissions";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import EditUserModal from "./editUserModal";
import { hasPermission } from "common/utils";
import Loading from "../../../components/loading";
import { User } from "common/models/auth";
import { usePageTitle } from "../../../api/hooks";

const Users = () => {
    usePageTitle("Users");
    const [page, setPage] = useState(1);
    const perPage = 10;
    const { data: usersData, isLoading, isFetching } = useGetUsersQuery({ page, perPage });
    const [editingUser, setEditingUser] = useState<User>();

    const columns = [
        { key: "username", label: "Name" },
        { key: "permissions", label: "Permissions", className: "max-sm:hidden" },
        { key: "roles", label: "Roles", className: "max-sm:hidden" },
        { key: "permissions_roles", label: "Permissions/Roles", className: "sm:hidden" },
        { key: "lastLogin", label: "Last Login", className: "max-md:hidden" },
        { key: "actions", label: "Actions" }
    ] as { key: string, label: string, className?: string }[];

    const renderCell = useCallback((user: User, columnKey: Key) => {
        const permissions = user.permissions.map((permission) => <Chip key={permission} className="capitalize" color="primary">{permission}</Chip>);
        const roles = user.roles.map((role) => <Chip key={role.name} className="capitalize" color="secondary">{role.name}</Chip>);
        switch (columnKey) {
            case "username":
                return (
                    <DisplayUser
                        avatarProps={{ radius: "lg", src: user.avatarUrl, className: "max-sm:hidden" }}
                        description={user.username}
                        name={user.displayname}
                    >
                        {user.discordId}
                    </DisplayUser>
                );
            case "permissions":
                return <div className="flex flex-wrap gap-1">
                    {permissions}
                </div>;
            case "roles":
                return <div className="flex flex-wrap gap-1">
                    {roles}
                </div>;
            case "permissions_roles":
                return <div className="flex flex-wrap gap-1">
                    {permissions.concat(roles)}
                </div>;
            case "lastLogin":
                return <span>{user.lastLogin?.toLocaleString()}</span>;
            case "actions":
                const allowedActions = [];
                if (hasPermission(user, Permission.EDIT_USERS)) {
                    allowedActions.push(<DropdownItem key="edit" onPress={() => setEditingUser(user)}>Edit</DropdownItem>);
                }
                return (
                    <div className="flex justify-center items-center">
                        <Dropdown isDisabled={!!editingUser}>
                            <DropdownTrigger>
                                <Button isIconOnly size="sm" variant="light">
                                    <FontAwesomeIcon icon={faEllipsisVertical} />
                                </Button>
                            </DropdownTrigger>
                            <DropdownMenu>
                                {allowedActions}
                            </DropdownMenu>
                        </Dropdown>
                    </div>
                );
        }
    }, [editingUser]);

    return <div className="space-y-2">
        <div>
            <h1><b>Users</b></h1>
            <p className="text-sm">Discord users have certain permissions for this website. Permissions can also be configured for that user's <Link size="sm" href={"/roles"}>roles</Link>.</p>
            <p className="text-sm">For a user to be added, they must be a member of the "SERVER NAME" discord server, and must have logged into this site at least once.</p>
        </div>
        <Table>
            <TableHeader columns={columns}>
                {(column) => (
                    <TableColumn
                        key={column.key}
                        className={column.className}
                    >
                        {column.label}
                    </TableColumn>
                )}
            </TableHeader>
            <TableBody emptyContent="No users from discord server have logged into site" items={usersData?.items ?? []} isLoading={isLoading || isFetching} loadingContent={<Loading/>}>
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
        <Pagination page={page} onChange={setPage} total={Math.ceil((usersData?.total ?? 0) / perPage)}/>
        <EditUserModal user={editingUser} onOpenChange={() => setEditingUser(undefined)} />
    </div>;
};

export default Users;