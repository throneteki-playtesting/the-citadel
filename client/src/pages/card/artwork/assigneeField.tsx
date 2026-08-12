import { useEffect, useState } from "react";
import { Avatar, Button, ButtonGroup } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faPencil, faTrash, faUserPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useGetUserQuery, useUpdateSlotMutation } from "../../../api";
import { showApiErrorToast } from "../../../api/errors";
import UserAutocomplete from "../../../components/data/userAutocomplete";

// Saves directly on the check, outside the form's own dirty-tracked Save - who has it has nothing to do
// with the rest of the artwork's fields
export default function AssigneeField({ project, number, assignee, isDisabled }: AssigneeFieldProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [pending, setPending] = useState(assignee);
    const [updateSlot, { isLoading: isSaving }] = useUpdateSlotMutation();
    // Optimistic - shown immediately rather than waiting for the invalidated getSlot refetch to catch up
    const [justSaved, setJustSaved] = useState<string>();
    useEffect(() => {
        if (justSaved !== undefined && (assignee ?? "") === justSaved) {
            setJustSaved(undefined);
        }
    }, [assignee, justSaved]);

    const shown = justSaved !== undefined ? justSaved : assignee;
    const { data: user } = useGetUserQuery({ discordId: shown ?? "" }, { skip: !shown });

    const edit = () => {
        setPending(shown);
        setIsEditing(true);
    };

    const save = async (value: string | undefined) => {
        try {
            await updateSlot({ project, number, statuses: { artwork: { assignee: value ?? "" } } }).unwrap();
            setJustSaved(value ?? "");
            setIsEditing(false);
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to update assignee" });
        }
    };

    if (isEditing) {
        return (
            <div className="flex items-center gap-1.5 w-full sm:w-80">
                <UserAutocomplete
                    size="sm"
                    variant="bordered"
                    placeholder="Search for someone..."
                    className="flex-1 min-w-0"
                    isDisabled={isSaving}
                    selectedId={pending}
                    onChange={setPending}
                />
                <ButtonGroup>
                    <Button
                        isIconOnly
                        size="sm"
                        variant="flat"
                        color="danger"
                        aria-label="Unassign"
                        isDisabled={!!shown && (isSaving || !assignee)}
                        onPress={() => (shown ? save(undefined) : setIsEditing(false))}
                    >
                        <FontAwesomeIcon icon={!shown ? faXmark : faTrash} />
                    </Button>
                    <Button
                        isIconOnly
                        size="sm"
                        variant="flat"
                        color="primary"
                        aria-label="Save assignee"
                        isLoading={isSaving}
                        onPress={() => save(pending)}
                    >
                        <FontAwesomeIcon icon={faCheck} />
                    </Button>
                </ButtonGroup>
            </div>
        );
    }

    if (!shown) {
        return isDisabled ? (
            <span className="text-xs sm:text-sm text-foreground/40">Unassigned</span>
        ) : (
            <Button
                size="sm"
                variant="flat"
                className="shrink-0 w-32"
                startContent={<FontAwesomeIcon icon={faUserPlus} />}
                onPress={edit}
            >
                Assign to...
            </Button>
        );
    }

    return (
        <div className="flex items-center gap-1.5 text-xs sm:text-sm text-foreground/70">
            <span className="text-foreground/40 whitespace-nowrap">Assigned to</span>
            <Avatar size="sm" src={user?.avatarUrl} alt={user?.displayname} className="!size-5 sm:!size-6 shrink-0" />
            <span className="min-w-0 truncate font-medium">{user?.displayname ?? "…"}</span>
            {!isDisabled && (
                <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    aria-label="Edit assignee"
                    className="shrink-0 size-6 min-w-6 text-foreground/40"
                    onPress={edit}
                >
                    <FontAwesomeIcon icon={faPencil} className="text-xs" />
                </Button>
            )}
        </div>
    );
}

type AssigneeFieldProps = {
    project: number;
    number: number;
    assignee?: string;
    isDisabled?: boolean;
};
