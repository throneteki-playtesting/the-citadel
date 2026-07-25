import { useState, useMemo } from "react";
import { ICard, IRenderCard } from "common/models/cards";
import { Card as CardSchema } from "common/models/schemas";
import { DeepPartial } from "common/types";
import { getBaseCardValues } from "common/utils";
import { useRenderImageMutation } from "../../api";
import { downloadBlob } from "../../utils";
import CardEditor from "../../components/cardEditor";
import { CardPreview } from "@agot/card-preview";
import { addToast, Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileImage } from "@fortawesome/free-solid-svg-icons";
import usePageTitle from "../../hooks/usePageTitle";

export default function CardEditorPage() {
    usePageTitle("Card Editor");
    const [card, setCard] = useState<DeepPartial<ICard>>({});
    const [renderImage, { isLoading: isRendering }] = useRenderImageMutation();
    const isValid = useMemo(() => !CardSchema.Full.validate(card, { abortEarly: true }).error, [card]);
    const renderCard = useMemo(() => ({ ...getBaseCardValues(card), key: "", watermark: {} }), [card]);

    const onExportPNG = async () => {
        try {
            const renderCard = {
                ...getBaseCardValues(card),
                key: crypto.randomUUID(),
                watermark: {}
            };
            const blob = await renderImage(renderCard as IRenderCard).unwrap();
            const filename = (card.name ?? "card").replace(/[^a-zA-Z0-9 ]/g, "").replace(/ /g, "_");
            downloadBlob(blob, `${filename}.png`);
        } catch {
            addToast({ title: "Failed to download", color: "danger", description: "An unknown error has occurred" });
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="px-4 md:px-0 space-y-2">
                <div className="font-cinzel text-2xl">Card Editor</div>
                <div className="text-sm md:text-base">
                    Use this page to sketch out a card idea and see how it looks as a finished card. Fill in the details below and the preview will
                    update automatically, so you can check the wording, icons and layout read coherently.
                </div>
                <div className="text-sm md:text-base">Happy with it? Use Export PNG to download the card image and share your idea.</div>
            </div>
            <div className="px-4 md:px-0 flex justify-between items-center">
                <Button
                    size="sm"
                    onPress={onExportPNG}
                    isLoading={isRendering}
                    isDisabled={!isValid}
                    startContent={!isRendering && <FontAwesomeIcon icon={faFileImage} />}
                >
                    Export PNG
                </Button>
            </div>
            <div className="flex flex-col md:flex-row gap-2">
                <CardPreview card={renderCard} className="self-center md:self-start shrink-0 max-w-86" />
                <CardEditor onUpdate={setCard} inputOptions={{ flavor: "hidden", deckLimit: "hidden" }}/>
            </div>
        </div>
    );
}
