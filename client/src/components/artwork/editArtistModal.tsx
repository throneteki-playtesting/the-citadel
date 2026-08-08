import { useEffect, useState } from "react";
import {
    Button,
    Form,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Switch,
    Textarea
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { IArtist } from "common/models/artwork";
import { Artist } from "common/models/schemas";
import { useCreateArtistMutation, useDeleteArtistMutation, useUpdateArtistMutation } from "../../api";
import { useFormValidation } from "../../hooks/useFormValidation";
import { showApiErrorToast } from "../../api/errors";
import FormValidationSummary from "../formValidationSummary";

const EMPTY: ArtistDraft = { name: "", contact: "", portfolio: "", blanketPermission: false, notes: "" };

/** Add or edit an artist, opened from wherever one is being picked so the flow is never interrupted */
export default function EditArtistModal({ isOpen, artist, onClose, onSaved, onDeleted }: EditArtistModalProps) {
    const [createArtist, { isLoading: isCreating }] = useCreateArtistMutation();
    const [updateArtist, { isLoading: isUpdating }] = useUpdateArtistMutation();
    const [deleteArtist, { isLoading: isDeleting }] = useDeleteArtistMutation();
    const [draft, setDraft] = useState<ArtistDraft>(EMPTY);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const { errors, validate, isValidationError, clearErrors } = useFormValidation(Artist.Draft);

    useEffect(() => {
        if (isOpen) {
            setDraft(artist ? { ...EMPTY, ...artist } : EMPTY);
            setIsConfirmingDelete(false);
            clearErrors();
        }
    }, [isOpen, artist, clearErrors]);

    const isSaving = isCreating || isUpdating;

    const onSave = async () => {
        const body = {
            name: draft.name.trim(),
            contact: draft.contact?.trim() || undefined,
            portfolio: draft.portfolio?.trim() || undefined,
            blanketPermission: draft.blanketPermission || undefined,
            notes: draft.notes?.trim() || undefined
        };
        if (!validate(body)) {
            return;
        }
        try {
            const saved = artist
                ? await updateArtist({ id: artist.id, ...body }).unwrap()
                : await createArtist(body).unwrap();
            onSaved?.(saved);
            onClose();
        } catch (err) {
            if (!isValidationError(err)) {
                showApiErrorToast(err, { title: `Failed to ${artist ? "update" : "add"} artist` });
            }
        }
    };

    // Whether anything still credits them is only knowable server-side, so the refusal comes from there
    // and is shown as it was written rather than guessed at up front
    const onDelete = async () => {
        if (!artist) {
            return;
        }
        try {
            await deleteArtist({ id: artist.id }).unwrap();
            onDeleted?.(artist);
            onClose();
        } catch (err) {
            setIsConfirmingDelete(false);
            showApiErrorToast(err, { title: `Failed to remove ${artist.name}` });
        }
    };

    const set = <K extends keyof ArtistDraft>(key: K, value: ArtistDraft[K]) =>
        setDraft((previous) => ({ ...previous, [key]: value }));

    return (
        <Modal isOpen={isOpen} placement="center" scrollBehavior="inside" onOpenChange={(open) => !open && onClose()}>
            <ModalContent>
                <ModalHeader className="flex flex-col gap-0.5">
                    <span>{artist ? "Edit Artist" : "New Artist"}</span>
                    <span className="text-xs sm:text-sm font-normal text-foreground/50">
                        Artists are shared across every project, so their details only need recording once.
                    </span>
                </ModalHeader>
                <Form
                    className="contents"
                    validationErrors={errors}
                    onSubmit={(e) => {
                        e.preventDefault();
                        void onSave();
                    }}
                >
                    <ModalBody className="gap-4">
                        <Input
                            label="Name"
                            name="name"
                            isRequired
                            value={draft.name}
                            onValueChange={(value) => set("name", value)}
                        />
                        <Input
                            label="Contact"
                            name="contact"
                            description="Usually an email, but anything they can be reached on works"
                            value={draft.contact}
                            onValueChange={(value) => set("contact", value)}
                        />
                        <Input
                            label="Portfolio"
                            name="portfolio"
                            description="Where their work lives - encouraged, so options can be found again later"
                            value={draft.portfolio}
                            onValueChange={(value) => set("portfolio", value)}
                        />
                        <Switch
                            isSelected={draft.blanketPermission}
                            onValueChange={(value) => set("blanketPermission", value)}
                        >
                            <div className="flex flex-col">
                                <span className="text-sm">Blanket permission</span>
                                <span className="text-xs text-foreground/50">
                                    They have allowed all of their work up front, so nobody needs to ask each time
                                </span>
                            </div>
                        </Switch>
                        <Textarea
                            label="Notes"
                            name="notes"
                            value={draft.notes}
                            onValueChange={(value) => set("notes", value)}
                        />

                        <FormValidationSummary
                            errors={errors}
                            mappedPaths={["name", "contact", "portfolio", "notes"]}
                        />

                        {artist && (
                            <div className="flex flex-col gap-2 p-3 rounded-md border border-danger/40 bg-danger/5">
                                <span className="font-cinzel uppercase tracking-wide text-xs text-danger">
                                    Danger zone
                                </span>
                                <p className="text-xs text-foreground/60">
                                    Removing {artist.name} takes them out of every project. This is refused while any
                                    artwork still credits them.
                                </p>
                                {isConfirmingDelete ? (
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            color="danger"
                                            isDisabled={isDeleting}
                                            startContent={<FontAwesomeIcon icon={faTrash} />}
                                            onPress={onDelete}
                                        >
                                            Yes, remove them
                                        </Button>
                                        <Button size="sm" variant="light" onPress={() => setIsConfirmingDelete(false)}>
                                            Cancel
                                        </Button>
                                    </div>
                                ) : (
                                    <Button
                                        size="sm"
                                        color="danger"
                                        variant="flat"
                                        className="self-start"
                                        startContent={<FontAwesomeIcon icon={faTrash} />}
                                        onPress={() => setIsConfirmingDelete(true)}
                                    >
                                        Remove artist
                                    </Button>
                                )}
                            </div>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <Button onPress={onClose}>Cancel</Button>
                        <Button type="submit" color="primary" isDisabled={isSaving}>
                            {artist ? "Save" : "Add"}
                        </Button>
                    </ModalFooter>
                </Form>
            </ModalContent>
        </Modal>
    );
}

type ArtistDraft = Pick<IArtist, "name"> &
    Partial<Pick<IArtist, "contact" | "portfolio" | "blanketPermission" | "notes">>;

type EditArtistModalProps = {
    isOpen: boolean;
    /** The artist being edited, or undefined to add a new one */
    artist?: IArtist;
    onClose: () => void;
    onSaved?: (artist: IArtist) => void;
    /** Whoever was picking them is left holding a reference to nothing, so they get told to let go */
    onDeleted?: (artist: IArtist) => void;
};
