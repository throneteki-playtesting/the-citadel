import { Key, useCallback, useMemo, useState } from "react";
import { useGetRolesQuery } from "../../../api";
import { Button, Input, Pagination, Spinner, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faPencil, faXmarkCircle } from "@fortawesome/free-solid-svg-icons";
import EditRoleModal from "./editRoleModal";
import Loading from "../../../components/loading";
import { Role } from "common/models/auth";
import usePageTitle from "../../../hooks/usePageTitle";
import { Filter } from "common/types";
import classNames from "classnames";

export default function Roles() {
    usePageTitle("Roles");

    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const perPage = 10;
    const filter = useMemo<Filter<Role>[]>(() => {
        const searchRegex = `(?i)${search}`;

        return [
            { name: { $regex: searchRegex } }
        ];
    }, [search]);
    const { data: rolesData, isLoading, isFetching } = useGetRolesQuery({ filter, page, perPage });

    // Reset to page 1 when search changes
    const handleSearch = (value: string) => {
        setSearch(value);
        setPage(1);
    };

    const [editingRole, setEditingRole] = useState<Role>();

    const columns = [
        { key: "name", label: "Name" },
        { key: "actions", label: "" }
    ] as { key: string; label: string; className?: string }[];

    const renderCell = useCallback((role: Role, columnKey: Key) => {
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
            case "actions":
                return (
                    <Button isIconOnly size="sm" variant="light" isDisabled={!!editingRole} onPress={() => setEditingRole(role)}>
                        <FontAwesomeIcon icon={faPencil} />
                    </Button>
                );
        }
    }, [editingRole]);

    return (
        <div className="space-y-2">
            <div className="font-cinzel text-2xl">Citadel Roles</div>
            <div className="text-sm md:text-base">Roles are managed within Discord, but can have citadel permissions tied to them.</div>
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
                    <Pagination page={page} onChange={setPage} total={Math.ceil((rolesData?.total ?? 0) / perPage)} />
                }
            >
                <TableHeader columns={columns}>
                    {(column) => (
                        <TableColumn key={column.key} className={column.className}>
                            {column.label}
                        </TableColumn>
                    )}
                </TableHeader>
                <TableBody emptyContent="There are no roles configured on discord server" items={rolesData?.items ?? []} isLoading={isLoading || isFetching} loadingContent={<Loading />}>
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
            <EditRoleModal role={editingRole} onOpenChange={() => setEditingRole(undefined)} />
        </div>
    );
};
