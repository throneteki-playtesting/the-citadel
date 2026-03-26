import { ReactElement, useState } from "react";
import { ICardSuggestion } from "common/models/cards";
import { useDeleteSuggestionMutation, useRenderImageMutation } from "../../api";
import Permission from "common/models/permissions";
import EditSuggestionModal from "./editSuggestionModal";
import { addToast, Button, Spinner } from "@heroui/react";
import { DeepPartial, SingleOrArray } from "common/types";
import PermissionGate from "../../components/permissionGate";
import { hasPermission, renderCardSuggestion, ValidationStep } from "common/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileExport, faFileImage, faFileImport, faPencil, faX } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { download } from "../../utils";
import { CardPreview } from "@agot/card-preview";
import SuggestionsGrid from "./suggestionsGrid";
import { User } from "common/models/auth";


const Suggestions = () => {
    const [editing, setEditing] = useState<DeepPartial<ICardSuggestion>>();
    const [deleteSuggestion, { isLoading: isDeleting, originalArgs: deleting }] = useDeleteSuggestionMutation();
    const [renderImage, { isLoading: isRenderingImage, originalArgs: renderingImage }] = useRenderImageMutation();

    const isDeletingSuggestion = (suggestion: ICardSuggestion) => isDeleting && deleting?.id === suggestion.id;
    const isRenderingSuggestion = (suggestion: ICardSuggestion) => isRenderingImage && renderingImage?.key === suggestion.id;

    const canEdit = (user: User, suggestion: ICardSuggestion) => {
        return (
            suggestion.id
            && (hasPermission(user, Permission.MAKE_SUGGESTIONS) && user.discordId === suggestion.user.discordId)
            || hasPermission(user, Permission.EDIT_SUGGESTIONS)
        );
    };
    const canDelete = (user: User, suggestion: ICardSuggestion) => {
        return (
            suggestion.id
            && (hasPermission(user, Permission.MAKE_SUGGESTIONS) && user.discordId === suggestion.user.discordId)
            || hasPermission(user, Permission.DELETE_SUGGESTIONS)
        );
    };

    const onEdit = (suggestion: ICardSuggestion) => {
        setEditing(suggestion);
    };
    const onExportPNG = async (suggestion: ICardSuggestion) => {
        try {
            const cardRender = renderCardSuggestion(suggestion);
            const result = await renderImage(cardRender).unwrap();
            const filename = `${suggestion.id || crypto.randomUUID()}.png`;
            download(result, filename);
        } catch (err) {
            // TODO: Better error handling from redux (eg. use ApiError.message for description)
            addToast({ title: "Failed to download", color: "danger", description: "An unknown error has occurred" });
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
            // TODO: Better error handling from redux (eg. use ApiError.message for description)
            addToast({ title: "Failed to delete", color: "danger", description: "An unknown error has occurred" });
        }
    };

    const CardButton = ({ isLoading, children, onPress, requires }: { isLoading?: boolean, children: ReactElement, onPress: () => void, requires?: SingleOrArray<ValidationStep<User>> }) => {
        return (
            <PermissionGate requires={requires}>
                <Button isLoading={isLoading} isIconOnly radius="full" variant="faded" size="sm" onPress={onPress}>
                    {children}
                </Button>
            </PermissionGate>
        );
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
                        <div key={suggestion.id} className="relative">
                            {isDeletingSuggestion(suggestion) && <div className="absolute right-0 w-full h-full z-2 flex justify-center items-center"><Spinner size="lg"/></div>}
                            <div className="absolute right-0 w-full h-full z-1 opacity-25 p-1 flex justify-end hover:opacity-90 transition-opacity gap-0.5">
                                <CardButton onPress={() => onEdit(suggestion)} requires={(user) => canEdit(user, suggestion)}>
                                    <FontAwesomeIcon icon={faPencil}/>
                                </CardButton>
                                <CardButton isLoading={isRenderingSuggestion(suggestion)} onPress={() => onExportPNG(suggestion)} requires={Permission.RENDER_CARDS}>
                                    <FontAwesomeIcon icon={faFileImage}/>
                                </CardButton>
                                <CardButton isLoading={isDeletingSuggestion(suggestion)} onPress={() => onDelete(suggestion)} requires={(user) => canDelete(user, suggestion)}>
                                    <FontAwesomeIcon icon={faX}/>
                                </CardButton>
                            </div>
                            <CardPreview
                                card={renderCardSuggestion(suggestion)}
                                orientation="vertical"
                                rounded={true}
                                className={classNames("relative transition-all", { "blur-xs": isDeletingSuggestion(suggestion) })}
                            />
                        </div>)}
                </SuggestionsGrid>
            </div>
            <EditSuggestionModal isOpen={!!editing} suggestion={editing} onClose={() => setEditing(undefined)} onSave={(suggestion) => addToast({ title: "Successfully saved", color: "success", description: `"${suggestion.card.name}" suggestion has been saved` })}/>
        </div>
    );
};

export default Suggestions;