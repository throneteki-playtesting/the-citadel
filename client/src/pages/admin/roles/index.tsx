import { Key, useCallback, useState } from "react";
import { useGetRolesQuery } from "../../../api";
import { Role } from "common/models/user";
import { Button, Chip, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Pagination, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import EditRoleModal from "./editRoleModal";
import Loading from "../../../components/loading";

const Roles = () => {
    const [page, setPage] = useState(1);
    const perPage = 10;
    const { data: rolesData, isLoading, isFetching } = useGetRolesQuery({ page, perPage });
    const [editingRole, setEditingRole] = useState<Role>();

    const columns = [
        { key: "name", label: "Name" },
        { key: "permissions", label: "Permissions" },
        { key: "actions", label: "Actions" }
    ] as { key: string, label: string, className?: string }[];

    const renderCell = useCallback((role: Role, columnKey: Key) => {
        const permissions = role.permissions.map((permission) => <Chip key={permission} className="capitalize" color="primary">{permission}</Chip>);
        switch (columnKey) {
            case "name":
                return <div className="flex flex-col">
                    <span className="capitalize" color="secondary">{role.name}</span>
                    <span className="text-xs text-gray-500 truncate">Id: {role.discordId}</span>
                </div>;
            case "permissions":
                return <div className="flex flex-wrap gap-1">
                    {permissions}
                </div>;
            case "actions":
                return (
                    <div className="flex justify-center items-center">
                        <Dropdown isDisabled={!!editingRole}>
                            <DropdownTrigger>
                                <Button isIconOnly size="sm" variant="light">
                                    <FontAwesomeIcon icon={faEllipsisVertical} />
                                </Button>
                            </DropdownTrigger>
                            <DropdownMenu>
                                <DropdownItem key="edit" onPress={() => setEditingRole(role)}>Edit</DropdownItem>
                            </DropdownMenu>
                        </Dropdown>
                    </div>
                );
        }
    }, [editingRole]);

    return <div className="space-y-2">
        <div>
            <h1><b>Roles</b></h1>
            <p className="text-sm">Discord roles can be used to handle permissions, and any users who have these roles will recieve those permissions (on top of their user permissions).</p>
            <p className="text-sm">To add a new role, create that role in "SERVER NAME" discord server, and refresh this page.</p>
        </div>
        <Table>
            <TableHeader columns={columns} className="h-56">
                {(column) => (
                    <TableColumn
                        key={column.key}
                        className={column.className}
                    >
                        {column.label}
                    </TableColumn>
                )}
            </TableHeader>
            <TableBody emptyContent="There are no roles configured on discord server" items={rolesData?.items ?? []} isLoading={isLoading || isFetching} loadingContent={<Loading/>}>
                {(item) => (
                    <TableRow key={item.discordId}>
                        {(columnKey) => {
                            const column = columns.find((c) => c.key === columnKey);
                            return <TableCell className={column?.className}>{renderCell(item, columnKey)}</TableCell>;
                        }}
                    </TableRow>
                )}
            </TableBody>
        </Table>
        <Pagination className="grow" page={page} onChange={setPage} total={Math.ceil((rolesData?.total ?? 0) / perPage)}/>
        <EditRoleModal role={editingRole} onOpenChange={() => setEditingRole(undefined)} />
    </div>;
};

export default Roles;