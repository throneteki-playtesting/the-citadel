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
    Select,
    SelectItem,
    Switch,
    Textarea
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { AnimatePresence, motion } from "framer-motion";
import { IArtist, IArtistPayment, PaymentType, paymentTypes } from "common/models/artwork";
import { ISlotRef } from "common/models/slots";
import { Artist } from "common/models/schemas";
import { EASE_STANDARD } from "../../constants";
import { useCreateArtistMutation, useDeleteArtistMutation, useUpdateArtistMutation } from "../../api";
import { useFormValidation } from "../../hooks/useFormValidation";
import { showApiErrorToast } from "../../api/errors";
import FormValidationSummary from "../formValidationSummary";

const EMPTY: ArtistDraft = {
    name: "",
    contact: "",
    portfolio: "",
    blanketPermission: false,
    payment: undefined,
    notes: ""
};

const EMPTY_PAYMENT = { revtag: "", email: "", accountName: "", iban: "", swiftBic: "" };

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
    revolut: "Revolut",
    paypal: "PayPal",
    bankTransfer: "International Bank Transfer"
};

const PANEL_TRAVEL = 12;
const PANEL_TRANSITION = { duration: 0.18, ease: EASE_STANDARD } as const;

// Its own form, named so its Add button submits it and nothing else - this opens from inside other forms
const ARTIST_FORM_ID = "edit-artist-form";

/** Add or edit an artist, opened from wherever one is being picked so the flow is never interrupted */
export default function EditArtistModal({ isOpen, artist, slot, onClose, onSaved, onDeleted }: EditArtistModalProps) {
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
            payment: draft.payment && {
                type: draft.payment.type,
                revtag: draft.payment.revtag?.trim() || undefined,
                email: draft.payment.email?.trim() || undefined,
                accountName: draft.payment.accountName?.trim() || undefined,
                iban: draft.payment.iban?.trim() || undefined,
                swiftBic: draft.payment.swiftBic?.trim() || undefined
            },
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

    // Only the server knows who else credits them; the card being edited is named so it does not count
    const onDelete = async () => {
        if (!artist) {
            return;
        }
        try {
            await deleteArtist({ id: artist.id, editing: slot }).unwrap();
            onDeleted?.(artist);
            onClose();
        } catch (err) {
            setIsConfirmingDelete(false);
            showApiErrorToast(err, { title: `Failed to remove ${artist.name}` });
        }
    };

    const set = <K extends keyof ArtistDraft>(key: K, value: ArtistDraft[K]) =>
        setDraft((previous) => ({ ...previous, [key]: value }));

    const setPaymentType = (type: PaymentType) =>
        setDraft((previous) => ({ ...previous, payment: { ...EMPTY_PAYMENT, ...previous.payment, type } }));

    const setPaymentField = <K extends keyof IArtistPayment>(key: K, value: IArtistPayment[K]) =>
        setDraft((previous) => ({ ...previous, payment: previous.payment && { ...previous.payment, [key]: value } }));

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
                    id={ARTIST_FORM_ID}
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
                        <div className="flex flex-col gap-3 p-3 rounded-md border border-content3">
                            <span className="font-cinzel uppercase tracking-wide text-xs text-foreground/60">
                                Payment info
                            </span>
                            <Select
                                label="Payment type"
                                name="payment.type"
                                isClearable
                                selectedKeys={draft.payment?.type ? [draft.payment.type] : []}
                                onChange={(e) => e.target.value && setPaymentType(e.target.value as PaymentType)}
                                onClear={() => set("payment", undefined)}
                            >
                                {paymentTypes.map((type) => (
                                    <SelectItem key={type}>{PAYMENT_TYPE_LABELS[type]}</SelectItem>
                                ))}
                            </Select>
                            <AnimatePresence mode="wait" initial={false}>
                                {draft.payment?.type && (
                                    <motion.div
                                        key={draft.payment.type}
                                        className="flex flex-col sm:flex-row gap-3"
                                        initial={{ opacity: 0, y: -PANEL_TRAVEL }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -PANEL_TRAVEL }}
                                        transition={PANEL_TRANSITION}
                                    >
                                        {draft.payment.type === "revolut" && (
                                            <Input
                                                label="Revtag"
                                                name="payment.revtag"
                                                className="flex-1"
                                                isRequired
                                                value={draft.payment.revtag ?? ""}
                                                onValueChange={(value) => setPaymentField("revtag", value)}
                                            />
                                        )}
                                        {draft.payment.type === "paypal" && (
                                            <Input
                                                label="Email"
                                                name="payment.email"
                                                className="flex-1"
                                                isRequired
                                                value={draft.payment.email ?? ""}
                                                onValueChange={(value) => setPaymentField("email", value)}
                                            />
                                        )}
                                        {draft.payment.type === "bankTransfer" && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                                                <Input
                                                    label="Account name"
                                                    name="payment.accountName"
                                                    className="sm:col-span-2"
                                                    isRequired
                                                    value={draft.payment.accountName ?? ""}
                                                    onValueChange={(value) => setPaymentField("accountName", value)}
                                                />
                                                <Input
                                                    label="IBAN"
                                                    name="payment.iban"
                                                    isRequired
                                                    value={draft.payment.iban ?? ""}
                                                    onValueChange={(value) => setPaymentField("iban", value)}
                                                />
                                                <Input
                                                    label="SWIFT/BIC"
                                                    name="payment.swiftBic"
                                                    isRequired
                                                    value={draft.payment.swiftBic ?? ""}
                                                    onValueChange={(value) => setPaymentField("swiftBic", value)}
                                                />
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <Textarea
                            label="Notes"
                            name="notes"
                            value={draft.notes}
                            onValueChange={(value) => set("notes", value)}
                        />
                        <FormValidationSummary
                            errors={errors}
                            mappedPaths={[
                                "name",
                                "contact",
                                "portfolio",
                                "payment.type",
                                "payment.revtag",
                                "payment.email",
                                "payment.accountName",
                                "payment.iban",
                                "payment.swiftBic",
                                "notes"
                            ]}
                        />
                        {artist && (
                            <div className="flex flex-col gap-2 p-3 rounded-md border border-danger/40 bg-danger/5">
                                <span className="font-cinzel uppercase tracking-wide text-xs text-danger">
                                    Danger zone
                                </span>
                                <p className="text-xs text-foreground/60">
                                    Removing {artist.name} takes them out of every project. This is refused while any
                                    other artwork still credits them.
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
                        <Button type="submit" form={ARTIST_FORM_ID} color="primary" isDisabled={isSaving}>
                            {artist ? "Save" : "Add"}
                        </Button>
                    </ModalFooter>
                </Form>
            </ModalContent>
        </Modal>
    );
}

type ArtistDraft = Pick<IArtist, "name"> &
    Partial<Pick<IArtist, "contact" | "portfolio" | "blanketPermission" | "payment" | "notes">>;

type EditArtistModalProps = {
    isOpen: boolean;
    /** The artist being edited, or undefined to add a new one */
    artist?: IArtist;
    /** The card this was opened from, whose own credit doesn't stand in the way of removing them */
    slot?: ISlotRef;
    onClose: () => void;
    onSaved?: (artist: IArtist) => void;
    /** Whoever was picking them is left holding a reference to nothing, so they get told to let go */
    onDeleted?: (artist: IArtist) => void;
};
