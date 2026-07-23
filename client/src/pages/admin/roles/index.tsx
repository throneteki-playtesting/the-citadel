import { Key, useCallback, useMemo, useState } from "react";
import { useGetRolesQuery } from "../../../api";
import { Button, Input, Pagination, Spinner, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faMagnifyingGlass, faPencil, faXmarkCircle } from "@fortawesome/free-solid-svg-icons";
import EditRoleModal from "./editRoleModal";
import Loading from "../../../components/loading";
import { Role, RoleWithUserCount } from "common/models/auth";
import usePageTitle from "../../../hooks/usePageTitle";
import { Filter } from "common/types";
import classNames from "classnames";
import SortableColumnHeader, { ColumnSort } from "../../../components/data/sortableColumnHeader";
import Permission from "common/models/permissions";
import { usePermission } from "../../../hooks/usePermission";
import { useAuth } from "../../../hooks/useAuth";

export default function Roles() {
    usePageTitle("Roles");

    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState<ColumnSort | undefined>({ key: "position", dir: "asc" });
    const perPage = 10;
    const orderBy = useMemo(() => sort ? { [sort.key]: sort.dir } : undefined, [sort]);
    const filter = useMemo<Filter<Role>[]>(() => {
        const searchRegex = `(?i)${search}`;

        return [
            { name: { $regex: searchRegex } }
        ];
    }, [search]);
    const { data: rolesData, isLoading, isFetching } = useGetRolesQuery({ filter, orderBy, page, perPage });

    // Reset to page 1 when search changes
    const handleSearch = (value: string) => {
        setSearch(value);
        setPage(1);
    };

    const [editingRole, setEditingRole] = useState<Role>();

    const canImpersonate = usePermission(Permission.IMPERSONATE_ROLE);
    const { impersonateRole, isImpersonating, isImpersonationActionPending } = useAuth();

    const columns = [
        { key: "name", label: "Name", sortKey: "name" },
        { key: "userCount", label: "Users" },
        { key: "actions", label: "" }
    ] as { key: string; label: string; sortKey?: string; className?: string }[];

    const renderCell = useCallback((role: RoleWithUserCount, columnKey: Key) => {
        switch (columnKey) {
            case "name":
                const hex = role.color ? `#${role.color.toString(16).padStart(6, "0")}` : undefined;
                return (
                    <div
                        key={role.discordId}
                        className={classNames("w-fit border py-1 px-2 rounded-md text-sm", { "border-content3": !hex })}
                        style={hex ? { backgroundColor: `${hex}33`, borderColor: `${hex}66`, color: hex } : undefined}
                    >
                        {role.name}
                    </div>
                );
            case "userCount":
                return <span>{role.userCount}</span>;
            case "actions":
                return (
                    <div className="flex gap-1">
                        {canImpersonate && !isImpersonating && (
                            <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                isDisabled={isImpersonationActionPending}
                                onPress={() => impersonateRole(role.discordId)}
                                title={`View as ${role.name}`}
                            >
                                <FontAwesomeIcon icon={faEye} />
                            </Button>
                        )}
                        <Button isIconOnly size="sm" variant="light" isDisabled={!!editingRole} onPress={() => setEditingRole(role)}>
                            <FontAwesomeIcon icon={faPencil} />
                        </Button>
                    </div>
                );
        }
    }, [canImpersonate, editingRole, impersonateRole, isImpersonating, isImpersonationActionPending]);

    return (
        <div className="space-y-2">
            <div className="px-4 md:px-0 space-y-2">
                <div className="font-cinzel text-2xl">Citadel Roles</div>
                <div className="text-sm md:text-base">Roles are managed within Discord, but can have citadel permissions tied to them.</div>
            </div>
            <Table
                topContentPlacement="outside"
                bottomContentPlacement="outside"
                topContent={
                    <div className="px-4">
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
                    </div>
                }
                bottomContent={
                    <div className="px-4">
                        <Pagination page={page} onChange={setPage} total={Math.max(1, Math.ceil((rolesData?.total ?? 0) / perPage))} />
                    </div>
                }
            >
                <TableHeader columns={columns}>
                    {(column) => (
                        <TableColumn key={column.key} className={column.className}>
                            {column.sortKey ? (
                                <SortableColumnHeader label={column.label} sortKey={column.sortKey} sort={sort} onChange={setSort} />
                            ) : column.label}
                        </TableColumn>
                    )}
                </TableHeader>
                <TableBody emptyContent="There are no roles configured on discord server" items={rolesData?.items ?? []} isLoading={isLoading || isFetching} loadingContent={<Loading />}>
                    {(item) => (
                        <TableRow key={item.discordId}>
                            {(columnKey) => {
                                const column = columns.find((c) => c.key === columnKey);
                                return <TableCell className={classNames("text-tiny sm:text-small", column?.className)}>{renderCell(item, columnKey)}</TableCell>;
                            }}
                        </TableRow>
                    )}
                </TableBody>
            </Table>
            <EditRoleModal role={editingRole} onOpenChange={() => setEditingRole(undefined)} />
        </div>
    );
};
