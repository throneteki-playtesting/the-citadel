import { useState } from "react";
import { ICardSuggestion } from "common/models/cards";
import { useDeleteSuggestionMutation, useRenderImageMutation } from "../../api";
import Permission from "common/models/permissions";
import EditSuggestionModal from "./editSuggestionModal";
import { addToast, Button, Dropdown, DropdownItem, DropdownMenu, DropdownSection, DropdownTrigger, Spinner } from "@heroui/react";
import { DeepPartial } from "common/types";
import { hasPermission, renderCardSuggestion } from "common/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faEllipsis, faFileExport, faFileImage, faFileImport, faPencil, faTrash, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { CardPreview } from "@agot/card-preview";
import SuggestionsGrid from "./suggestionsGrid";
import { User } from "common/models/auth";
import { downloadBlob } from "../../utils";
import usePageTitle from "../../hooks/usePageTitle";
import { groupBy } from "lodash-es";
import { usePermission } from "../../hooks/usePermission";
import PermissionGate from "../../components/permissionGate";
import { showApiErrorToast } from "../../api/errors";

type DropdownItemDef = {
    key: string;
    label: string;
    group: string;
    icon: IconDefinition;
    onPress: () => void;
    className?: string;
    style?: React.CSSProperties;
};

export default function Suggestions() {
    usePageTitle("Suggestions");
    const [editing, setEditing] = useState<DeepPartial<ICardSuggestion>>();
    const [deleteSuggestion, { isLoading: isDeleting, originalArgs: deleting }] = useDeleteSuggestionMutation();
    const [renderImage, { isLoading: isRenderingImage, originalArgs: renderingImage }] = useRenderImageMutation();

    const isDeletingSuggestion = (suggestion: ICardSuggestion) => isDeleting && deleting?.id === suggestion.id;
    const isRenderingSuggestion = (suggestion: ICardSuggestion) => isRenderingImage && renderingImage?.key === suggestion.id;

    const onEdit = (suggestion: ICardSuggestion) => {
        setEditing(suggestion);
    };
    const onCopy = (suggestion: ICardSuggestion) => {
        setEditing({ card: suggestion.card });
    };
    const onExportPNG = async (suggestion: ICardSuggestion) => {
        try {
            const cardRender = renderCardSuggestion(suggestion);
            const blob = await renderImage(cardRender).unwrap();
            downloadBlob(blob, `${suggestion.id ?? crypto.randomUUID()}.png`);
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Download" });
        }
    };
    const onDelete = async (suggestion: ICardSuggestion) => {
        if (!suggestion.id) {
            return;
        }
        try {
            await deleteSuggestion({ id: suggestion.id }).unwrap();
            addToast({ title: "Successfully deleted", color: "success", description: "Successfully deleted suggestion" });
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Delete" });
        }
    };
    return (
        <div className="flex flex-col gap-2 lg:flex-row">
            <div className='flex flex-col gap-2 flex-grow'>
                <div className="flex gap-1">
                    <PermissionGate requires={Permission.IMPORT_SUGGESTIONS}>
                        <Button size="sm" isIconOnly={true}>
                            <FontAwesomeIcon icon={faFileImport} />
                        </Button>
                    </PermissionGate>
                    <PermissionGate requires={Permission.MAKE_SUGGESTIONS}>
                        <Button className="grow" size="sm" onPress={() => setEditing({})}>
                        Create Suggestion
                        </Button>
                    </PermissionGate>
                    <PermissionGate requires={Permission.EXPORT_SUGGESTIONS}>
                        <Button size="sm" isIconOnly={true}>
                            <FontAwesomeIcon icon={faFileExport} />
                        </Button>
                    </PermissionGate>
                </div>
                <SuggestionsGrid>
                    {(suggestion) => (
                        <SuggestionCard
                            key={suggestion.id}
                            suggestion={suggestion}
                            onEdit={onEdit}
                            onCopy={onCopy}
                            onExportPNG={onExportPNG}
                            onDelete={onDelete}
                            isDeleting={isDeletingSuggestion(suggestion)}
                            isExporting={isRenderingSuggestion(suggestion)}
                        />
                    )}
                </SuggestionsGrid>
            </div>
            <EditSuggestionModal isOpen={!!editing} suggestion={editing} onClose={() => setEditing(undefined)} onSave={(suggestion) => addToast({ title: "Successfully saved", color: "success", description: `"${suggestion.card.name}" suggestion has been saved` })}/>
        </div>
    );
};

type SuggestionCardProps = {
    suggestion: ICardSuggestion;
    onEdit: (suggestion: ICardSuggestion) => void;
    onCopy: (suggestion: ICardSuggestion) => void;
    onExportPNG: (suggestion: ICardSuggestion) => void;
    onDelete: (suggestion: ICardSuggestion) => void;
    isDeleting: boolean;
    isExporting: boolean;
};

function SuggestionCard({ suggestion, onEdit, onCopy, onExportPNG, onDelete, isDeleting }: SuggestionCardProps) {
    const canCreate = usePermission(Permission.MAKE_SUGGESTIONS);
    const canEdit = usePermission(
        (user: User) => !!(
            (suggestion.id && hasPermission(user, Permission.MAKE_SUGGESTIONS) && user.discordId === suggestion.user.discordId)
            || hasPermission(user, Permission.EDIT_SUGGESTIONS)
        )
    );
    const canDelete = usePermission(
        (user: User) => !!(
            (suggestion.id && hasPermission(user, Permission.MAKE_SUGGESTIONS) && user.discordId === suggestion.user.discordId)
            || hasPermission(user, Permission.DELETE_SUGGESTIONS)
        )
    );
    const canRenderCard = usePermission(Permission.RENDER_CARDS);

    const dropdownItems: DropdownItemDef[] = [
        canEdit && { key: "edit", label: "Edit", group: "Suggestion", icon: faPencil, onPress: () => onEdit(suggestion) },
        canCreate && { key: "copy", label: "Copy", group: "Suggestion", icon: faCopy, onPress: () => onCopy(suggestion) },
        canRenderCard && { key: "export-png", label: "Export PNG", group: "Suggestion", icon: faFileImage, onPress: () => onExportPNG(suggestion) },
        canDelete && { key: "delete", label: "Delete", group: "Suggestion", icon: faTrash, className: "text-danger", onPress: () => onDelete(suggestion) }
    ].flatMap(item => item ? [item] : []);
    const grouped = groupBy(dropdownItems, item => item.group);

    return (
        <div className="relative">
            {isDeleting && <div className="absolute right-0 w-full h-full z-2 flex justify-center items-center"><Spinner size="lg"/></div>}
            <div className="absolute top-0 right-0 z-1 opacity-25 p-1 hover:opacity-90 transition-opacity">
                <Dropdown>
                    <DropdownTrigger>
                        <Button isIconOnly radius="full" size="sm" variant="faded">
                            <FontAwesomeIcon icon={faEllipsis}/>
                        </Button>
                    </DropdownTrigger>
                    <DropdownMenu emptyContent="No actions">
                        {Object.entries(grouped).map(([group, items]) => (
                            <DropdownSection key={group} title={group}>
                                {items.map(item => (
                                    <DropdownItem key={item.key} className={item.className} style={item.style} startContent={<FontAwesomeIcon icon={item.icon}/>} onPress={item.onPress}>
                                        {item.label}
                                    </DropdownItem>
                                ))}
                            </DropdownSection>
                        ))}
                    </DropdownMenu>
                </Dropdown>
            </div>
            <CardPreview
                card={renderCardSuggestion(suggestion)}
                orientation="vertical"
                rounded={true}
                className={classNames("relative transition-all", { "blur-xs": isDeleting })}
            />
        </div>
    );
}