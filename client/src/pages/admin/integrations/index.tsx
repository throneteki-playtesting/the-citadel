import { addToast, Avatar, AvatarGroup, Button, Chip, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow, Pagination, Input, Spinner } from "@heroui/react";
import { useDeleteIntegrationMutation, useGetIntegrationsQuery, useGetUserQuery } from "../../../api";
import { Key, useCallback, useMemo, useState } from "react";
import Permission from "common/models/permissions";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faMagnifyingGlass, faPencil, faPlus, faTrash, faXmarkCircle } from "@fortawesome/free-solid-svg-icons";
import EditIntegrationModal from "./editIntegrationModal";
import TokenModal from "./tokenModal";
import ConfirmModal from "../../../components/confirmModal";
import Loading from "../../../components/loading";
import { SafeIntegration } from "common/models/auth";
import usePageTitle from "../../../hooks/usePageTitle";
import { usePermission } from "../../../hooks/usePermission";
import useTimezone from "../../../hooks/useTimezone";
import { Filter } from "common/types";

export default function Integrations() {
    usePageTitle("Integrations");

    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const perPage = 10;
    const filter = useMemo<Filter<SafeIntegration>>(() => ({ name: { $regex: `(?i)${search}` } }), [search]);
    const { data: integrationsData, isLoading, isFetching } = useGetIntegrationsQuery({ filter, page, perPage });

    // Reset to page 1 when search changes
    const handleSearch = (value: string) => {
        setSearch(value);
        setPage(1);
    };

    const [editing, setEditing] = useState<{ integration?: SafeIntegration }>();
    const [deletingIntegration, setDeletingIntegration] = useState<SafeIntegration>();
    const [tokenView, setTokenView] = useState<{ integration: SafeIntegration, token?: string }>();

    const [deleteIntegration, { isLoading: isDeleting }] = useDeleteIntegrationMutation();

    const canCreate = usePermission(Permission.CREATE_INTEGRATIONS);
    const canEdit = usePermission(Permission.EDIT_INTEGRATIONS);
    const canDelete = usePermission(Permission.DELETE_INTEGRATIONS);
    const { format } = useTimezone();

    const onDelete = useCallback(async () => {
        if (deletingIntegration) {
            const response = await deleteIntegration({ id: deletingIntegration.id });
            if (response.error) {
                addToast({ title: "Error", color: "danger", description: "Failed to delete integration" });
            } else {
                addToast({ title: "Integration deleted", color: "success", description: `${deletingIntegration.name} was deleted successfully.` });
                setDeletingIntegration(undefined);
            }
        }
    }, [deleteIntegration, deletingIntegration]);

    const columns = [
        { key: "name", label: "Name" },
        { key: "status", label: "Status" },
        { key: "owners", label: "Owners", className: "max-sm:hidden" },
        { key: "lastUsedAt", label: "Last Used", className: "max-sm:hidden" },
        { key: "actions", label: "" }
    ] as { key: string; label: string; className?: string }[];

    const renderCell = useCallback((integration: SafeIntegration, columnKey: Key) => {
        switch (columnKey) {
            case "name":
                return (
                    <div className="flex flex-col">
                        <span className="text-small">{integration.name}</span>
                        <span className="text-tiny text-default-400">{integration.id}</span>
                    </div>
                );
            case "status":
                return (
                    <Chip size="sm" variant="flat" color={integration.enabled ? "success" : "default"}>
                        {integration.enabled ? "Enabled" : "Disabled"}
                    </Chip>
                );
            case "owners":
                return <OwnerAvatars ownerIds={integration.ownerIds ?? []}/>;
            case "lastUsedAt":
                return <span>{integration.lastUsedAt ? format(integration.lastUsedAt) : "Never"}</span>;
            case "actions":
                return (
                    <div className="flex justify-end">
                        <Button isIconOnly size="sm" variant="light" title="View token" onPress={() => setTokenView({ integration })}>
                            <FontAwesomeIcon icon={faEye} />
                        </Button>
                        {canEdit && (
                            <Button isIconOnly size="sm" variant="light" title="Edit" isDisabled={!!editing} onPress={() => setEditing({ integration })}>
                                <FontAwesomeIcon icon={faPencil} />
                            </Button>
                        )}
                        {canDelete && (
                            <Button isIconOnly size="sm" variant="light" color="danger" title="Delete" onPress={() => setDeletingIntegration(integration)}>
                                <FontAwesomeIcon icon={faTrash} />
                            </Button>
                        )}
                    </div>
                );
        }
    }, [canDelete, canEdit, editing, format]);

    return (
        <div className="space-y-2">
            <div className="px-4 md:px-0 space-y-2">
                <div className="font-cinzel text-2xl">Integrations</div>
                <div className="text-sm md:text-base">Integrations grant external tools & services access to the API via a bearer token, limited to the permissions assigned here.</div>
                <div className="text-sm md:text-base">Tokens are only shown once upon creation or refresh; refreshing a token immediately invalidates the previous one.</div>
            </div>
            <Table
                topContent={
                    <div className="flex gap-3 items-center justify-between">
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
                        {canCreate && (
                            <Button color="primary" className="shrink-0" startContent={<FontAwesomeIcon icon={faPlus} />} onPress={() => setEditing({})}>
                                Create
                            </Button>
                        )}
                    </div>
                }
                bottomContent={
                    <Pagination page={page} onChange={setPage} total={Math.ceil((integrationsData?.total ?? 0) / perPage)} />
                }
            >
                <TableHeader columns={columns}>
                    {(column) => (
                        <TableColumn key={column.key} className={column.className}>
                            {column.label}
                        </TableColumn>
                    )}
                </TableHeader>
                <TableBody emptyContent="No integrations have been created" items={integrationsData?.items ?? []} isLoading={isLoading} loadingContent={<Loading />}>
                    {(item) => (
                        <TableRow key={item.id}>
                            {(columnKey) => {
                                const column = columns.find((c) => c.key === columnKey);
                                return <TableCell className={column?.className}>{renderCell(item, columnKey)}</TableCell>;
                            }}
                        </TableRow>
                    )}
                </TableBody>
            </Table>
            <EditIntegrationModal
                isOpen={!!editing}
                integration={editing?.integration}
                onOpenChange={() => setEditing(undefined)}
                onCreated={(token, integration) => setTokenView({ integration, token })}
            />
            <ConfirmModal
                isOpen={!!deletingIntegration}
                isLoading={isDeleting}
                title="Delete Integration"
                content={`Are you sure you want to delete "${deletingIntegration?.name}"? Its token will immediately stop working.`}
                confirmContent="Delete"
                onClose={() => setDeletingIntegration(undefined)}
                onConfirm={onDelete}
            />
            <TokenModal integration={tokenView?.integration} initialToken={tokenView?.token} onClose={() => setTokenView(undefined)} />
        </div>
    );
};

function OwnerAvatars({ ownerIds }: { ownerIds: string[] }) {
    const canReadUser = usePermission(Permission.READ_USER);

    if (ownerIds.length === 0) {
        return <span className="text-default-400">-</span>;
    }
    if (!canReadUser) {
        return <span>{ownerIds.length}</span>;
    }
    return (
        <AvatarGroup size="sm" max={4} className="justify-start">
            {ownerIds.map((id) => (
                <OwnerAvatar key={id} discordId={id}/>
            ))}
        </AvatarGroup>
    );
}

function OwnerAvatar({ discordId }: { discordId: string }) {
    const { data: owner } = useGetUserQuery({ discordId });

    return <Avatar size="sm" src={owner?.avatarUrl} name={owner?.displayname ?? discordId} showFallback/>;
}