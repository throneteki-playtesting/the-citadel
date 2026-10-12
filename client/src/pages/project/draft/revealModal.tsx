import { ReactNode } from "react";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { CardPreview } from "@agot/card-preview";
import { IPlaytestCard } from "common/models/cards";
import { previewedCard, previewOf } from "common/models/slots";
import { renderPlaytestingCard } from "common/utils";
import { useRevealSlotMutation, useWithdrawSlotRevealMutation } from "../../../api";
import { showApiErrorToast } from "../../../api/errors";
import { useSlotTitle } from "../../../components/slots/slotTitle";
import { DraftSlot } from "./draftSlots";
import { showPreviewToast } from "./previewToast";
import { RevealAction, revealLabels } from "./revealState";

const explanations = (after?: IPlaytestCard, before?: IPlaytestCard): Record<RevealAction, ReactNode> => ({
    reveal: "Reveals this card to the design team within the card forum as an early preview. You may force an update or replacement post later.",
    update: "Updates the preview post to show this card as it is now. The thread and its discussion are kept.",
    replace: (
        <>
            Posts <b className="text-foreground">{after?.name}</b> to the card forum as the new preview, and closes the
            one for <b className="text-foreground">{before?.name}</b> with a link to it. The closed thread's discussion
            is kept.
        </>
    ),
    withdraw:
        "Closes the preview thread in the card forum. Its discussion is kept, and the cards themselves are untouched."
});

// What a slot's reveal will change, before it does - the preview as posted, beside the card as it stands
export default function RevealModal({ isOpen, action, slot, onClose }: RevealModalProps) {
    const title = useSlotTitle(slot.slot.project, slot.number, revealLabels[action]);
    const [reveal, { isLoading: isRevealing }] = useRevealSlotMutation();
    const [withdraw, { isLoading: isWithdrawing }] = useWithdrawSlotRevealMutation();
    const preview = previewOf(slot.slot);
    const before = action === "reveal" ? undefined : preview;
    const after =
        action === "withdraw"
            ? undefined
            : action === "update"
              ? previewedCard(slot.options, preview)
              : slot.options[0];

    const onConfirm = async () => {
        const ref = { project: slot.slot.project, number: slot.number };
        try {
            await (
                action === "withdraw"
                    ? withdraw(ref)
                    : reveal({ ...ref, action: action === "reveal" ? undefined : action })
            ).unwrap();
            showPreviewToast(ref, action);
            onClose();
        } catch (err) {
            showApiErrorToast(err, { title: `Failed to ${revealLabels[action].toLowerCase()}` });
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size={before && after ? "xl" : "md"}
            placement="center"
            scrollBehavior="inside"
        >
            <ModalContent>
                <ModalHeader>{title}</ModalHeader>
                <ModalBody>
                    <span className="text-sm text-foreground/70">{explanations(after, before)[action]}</span>
                    <div className="flex flex-wrap justify-center gap-6">
                        {before && (
                            <PreviewFigure label="Current">
                                <CardFace card={before} />
                            </PreviewFigure>
                        )}
                        {after && (
                            <PreviewFigure label={before ? "New" : "To post"}>
                                <CardFace card={after} />
                            </PreviewFigure>
                        )}
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button variant="flat" isDisabled={isRevealing || isWithdrawing} onPress={onClose}>
                        Cancel
                    </Button>
                    <Button
                        color={action === "withdraw" ? "danger" : "primary"}
                        isLoading={isRevealing || isWithdrawing}
                        onPress={onConfirm}
                    >
                        {revealLabels[action]}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

type RevealModalProps = {
    isOpen: boolean;
    action: RevealAction;
    slot: DraftSlot;
    onClose: () => void;
};

function PreviewFigure({ label, children }: { label: string; children: ReactNode }) {
    return (
        <figure className="flex w-60 flex-col items-center gap-2">
            <figcaption className="font-cinzel text-xs uppercase tracking-widest text-foreground/60">
                {label}
            </figcaption>
            {children}
        </figure>
    );
}

function CardFace({ card }: { card: IPlaytestCard }) {
    return (
        <CardPreview
            className="select-none"
            orientation={card.type === "plot" ? "horizontal" : undefined}
            card={renderPlaytestingCard(card)}
        />
    );
}
