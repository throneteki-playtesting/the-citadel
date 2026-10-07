import { IPlaytestCard } from "common/models/cards";
import { NEW_OPTION_VERSION } from "common/models/slots";
import { SlotCondition } from "common/models/slotConditions";
import { BaseElementProps } from "../../types";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { usePutDraftCardMutation } from "../../api";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { DeepPartial } from "common/types";
import CardEditor from "../../components/cardEditor";
import { getBaseCardValues, isPreview, renderPlaytestingCard } from "common/utils";
import { PlaytestingCard } from "common/models/schemas";
import { Wizard, WizardBack, WizardNext, WizardPage, WizardPages, ValidationSummary } from "../../components/wizard";
import NoteEditor from "./noteEditor";
import AddressedInquiries from "./refinement/addressedInquiries";
import { useIsReleaseBound } from "../../hooks/useIsReleaseBound";
import StatusNotice from "../../components/statusNotice";
import { faFlagCheckered } from "@fortawesome/free-solid-svg-icons";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { DraftCardBadges } from "../project/draft/draftCardContent";
import { renderDraftCard as renderStackCard } from "../project/draft/draftSlots";
import EditorCardPreview from "../../components/cardEditor/editorCardPreview";
import ScaledBadges from "../project/draft/scaledBadges";
import TransitCard from "../project/draft/transitCard";
import { EDITOR_CARD_WIDTH } from "../../constants";
import { useStableCallback } from "../../hooks/useStableCallback";
import { EditOrigin, useCardEditFlight } from "./useCardEditFlight";

// Opacity alone, so the preview a card is carried to is already where it will be as the modal arrives
const FADE_ONLY = {
    variants: {
        enter: { opacity: 1, transition: { duration: 0.2, ease: "easeOut" } },
        exit: { opacity: 0, transition: { duration: 0.2, ease: "easeIn" } }
    }
} as const;

export default function EditCardModal({
    title = "Card Editor",
    isOpen,
    card: initial,
    origin,
    conditions,
    stackWidth,
    onClose: onModalClose = () => true,
    onSave = () => true
}: EditCardModalProps) {
    const [putDraft, { isLoading: isPuttingDraft }] = usePutDraftCardMutation();
    const prefersReducedMotion = useReducedMotion();
    const [card, setCard] = useState<DeepPartial<IPlaytestCard>>({});
    const onModalCloseStable = useStableCallback(onModalClose);
    const flight = useCardEditFlight({
        isOpen,
        initial,
        card,
        origin,
        conditions,
        stackWidth,
        onClose: onModalCloseStable
    });
    const { previewRef, faceRef, revertedTo } = flight;
    // Kept apart from the card - it says something about the card's inquiries, not about the card
    const [addressedInquiries, setAddressedInquiries] = useState<number[]>([]);

    // Left as it is once the card goes, so the modal keeps its shape while it fades out
    useEffect(() => {
        if (!initial) {
            return;
        }
        setCard(initial);
        setAddressedInquiries([]);
    }, [initial]);

    const isDraftReleaseBound = useIsReleaseBound(card.project, card.number);

    // Release-bound drafts are almost always a refinement - preselected once there's nothing chosen yet,
    // but only a starting point: picking any type here (including refinement itself) stops this from firing again
    useEffect(() => {
        if (isDraftReleaseBound && !card.note?.type) {
            setCard((prev) => ({ ...prev, note: { ...prev.note, type: "refinement" } }));
        }
    }, [isDraftReleaseBound, card.note?.type]);

    const onSubmit = useCallback(
        async (validCard: IPlaytestCard) => {
            setCard(validCard);
            const departing = previewRef.current?.getBoundingClientRect();
            const newCard = await putDraft({ ...validCard, addressedInquiries }).unwrap();
            setCard(newCard);
            // A new card is carried to its pile from where its preview sat, which is left empty as the modal fades
            const isArriving = initial?.version === NEW_OPTION_VERSION && !prefersReducedMotion;
            if (isArriving) {
                previewRef.current?.style.setProperty("visibility", "hidden");
            }
            onSave(newCard, isArriving ? departing : undefined);
            onModalClose();
        },
        [addressedInquiries, initial?.version, onModalClose, onSave, prefersReducedMotion, previewRef, putDraft]
    );

    // Cancelling a card which came from a stack shows it as it was before the modal goes, to be carried home as it was
    const shown = revertedTo ?? card;

    // Drawn as it is in its stack when it came from one, rather than as a draft
    const renderDraftCard = useMemo(() => {
        if (origin) {
            return renderStackCard(shown as IPlaytestCard, origin.rank, origin.slotNumber);
        }
        if (initial?.version === NEW_OPTION_VERSION) {
            return renderStackCard(shown as IPlaytestCard, 0, shown.number ?? 0);
        }
        const render = renderPlaytestingCard(shown);
        render.watermark = { ...render.watermark, middle: "Draft" };
        return render;
    }, [shown, initial?.version, origin]);

    return (
        <>
            <Modal
                isOpen={isOpen}
                placement="top-center"
                onOpenChange={(isOpen) => !isOpen && flight.cancel()}
                isDismissable={false}
                size="5xl"
                scrollBehavior="inside"
                motionProps={origin ? FADE_ONLY : undefined}
            >
                <ModalContent>
                    {(onClose) => (
                        <Wizard schema={PlaytestingCard.Draft} onSubmit={onSubmit} data={card}>
                            <ModalHeader>{title}</ModalHeader>
                            <ModalBody>
                                <ValidationSummary />
                                {isDraftReleaseBound && (
                                    <StatusNotice
                                        icon={faFlagCheckered}
                                        color="warning"
                                        label="Marked for release"
                                        detail="This card is locked to its printed form — this draft won't trigger a playtesting update."
                                    />
                                )}
                                <div className="flex flex-col md:flex-row gap-2 min-w-0">
                                    <EditorCardPreview
                                        ref={previewRef}
                                        faceRef={faceRef}
                                        card={renderDraftCard}
                                        handoffKey={revertedTo ? "original" : "edited"}
                                        isPlot={(shown.type ?? initial?.type) === "plot"}
                                        isTurning={!!revertedTo}
                                        verticalWidth={EDITOR_CARD_WIDTH.modal}
                                        className="self-center md:self-start"
                                    >
                                        <ScaledBadges referenceWidth={flight.referenceWidth}>
                                            <DraftCardBadges issues={flight.shownIssues} actions={[]} isLive />
                                        </ScaledBadges>
                                    </EditorCardPreview>
                                    <WizardPages className="flex-1 min-w-0">
                                        <WizardPage controlledData={getBaseCardValues(card)}>
                                            <CardEditor
                                                card={card}
                                                onUpdate={setCard}
                                                inputOptions={{ faction: "disabled" }}
                                            />
                                        </WizardPage>
                                        {!isPreview(card) && (
                                            <WizardPage controlledData={{ note: card.note ?? {} }}>
                                                <NoteEditor
                                                    note={card.note}
                                                    isReleaseBound={isDraftReleaseBound}
                                                    onChange={(note) => setCard((prev) => ({ ...prev, note }))}
                                                />
                                                <AddressedInquiries
                                                    project={card.project}
                                                    number={card.number}
                                                    version={card.draft ? card.version : undefined}
                                                    value={addressedInquiries}
                                                    onChange={setAddressedInquiries}
                                                />
                                            </WizardPage>
                                        )}
                                    </WizardPages>
                                </div>
                            </ModalBody>
                            <ModalFooter>
                                <WizardBack onCancel={onClose} />
                                <WizardNext isLoading={isPuttingDraft} color="primary" />
                            </ModalFooter>
                        </Wizard>
                    )}
                </ModalContent>
            </Modal>
            {flight.forward && <TransitCard {...flight.forward} />}
            {flight.backward && <TransitCard {...flight.backward} />}
        </>
    );
}

export type { EditOrigin };

type EditCardModalProps = Omit<BaseElementProps, "children"> & {
    title?: ReactNode;
    isOpen: boolean;
    card?: DeepPartial<IPlaytestCard>;
    /** What the card's slot asks for, so the card says so live whenever it doesn't measure up */
    conditions?: SlotCondition[];
    /** The width a card is drawn at in its stack, which its badges are sized from */
    stackWidth?: number;
    /** The card was opened from its stack, so it is drawn and carried as it is there */
    origin?: EditOrigin;
    onClose?: () => void;
    /** Where the preview sat, for a card just added - to carry it from there */
    onSave?: (card: IPlaytestCard, from?: DOMRect) => void;
};
