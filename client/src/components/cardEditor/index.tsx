import { ICard, DefaultDeckLimit } from "common/models/cards";
import { useCallback, useEffect, useState } from "react";
import { ChallengeIconButtons, CostInput, FactionSelect, LoyalButton, PlotStatInputs, StrengthInput, TraitsInput, TypeSelect, UniqueButton } from "./components/editorComponents";
import AbilityTextEditor from "./components/abilityEditor";
import { Accordion, AccordionItem, Input, NumberInput, Textarea } from "@heroui/react";
import { DeepPartial } from "common/types";
import { BaseElementProps } from "../../types";
import classNames from "classnames";

const defaultVisibility: VisibilityOptions = { type: true, faction: true };

const CardEditor = ({ className, style, card: initial, inputOptions = {}, onUpdate = () => true }: CardEditorProps) => {
    const [card, setCard] = useState<DeepPartial<ICard>>({});
    const [visibility, setVisibility] = useState<VisibilityOptions>(defaultVisibility);

    const isDisabled = useCallback((name: keyof ICard) => inputOptions[name] === "disabled", [inputOptions]);
    const isVisible = useCallback((...names: (keyof ICard)[]) => names.some((name) => visibility[name] && inputOptions[name] !== "hidden"), [inputOptions, visibility]);

    useEffect(() => {
        setCard(initial ?? {});
    }, [initial]);

    const applyDefaults = (card: DeepPartial<ICard>) => {
        const defaults: DeepPartial<ICard> = {};
        if (card.type === "character") {
            defaults.icons = {
                military: card.icons?.military ?? false,
                intrigue: card.icons?.intrigue ?? false,
                power: card.icons?.power ?? false
            };
        } else {
            delete card.icons;
        }
        if (["character", "attachment", "location"].includes(card.type ?? "")) {
            defaults.unique = card.unique ?? false;
        } else {
            delete card.unique;
        }

        if (card.faction && card.faction !== "neutral") {
            defaults.loyal = card.loyal ?? false;
        } else {
            delete card.loyal;
        }

        return { ...card, ...defaults };
    };

    const handleChange = useCallback((field: keyof ICard, value: unknown) => {
        const updated = applyDefaults({ ...card, [field]: value });
        setCard(updated);
        onUpdate(updated);
    }, [card, onUpdate]);

    // Update visibility
    useEffect(() => {
        const updated = { ...defaultVisibility };
        if (card.type) {
            updated.name = true;
            updated.traits = true;
            updated.text = true;
            updated.flavor = true;
            updated.designer = true;
            updated.deckLimit = true;

            switch (card.type) {
                case "character":
                    updated.icons = true;
                    updated.strength = true;
                case "attachment":
                case "location":
                    updated.unique = true;
                case "event":
                    updated.cost = true;
                    break;
                case "plot":
                    updated.plotStats = true;
            }

            if (card.faction && card.faction !== "neutral") {
                updated.loyal = true;
            }
        }
        setVisibility(updated);
    }, [card.faction, card.type]);

    return (
        <div className={classNames("space-y-2 w-full", className)} style={style}>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap md:flex-col lg:flex-row lg:flex-wrap">
                <div className="flex gap-2 w-full">
                    {isVisible("faction") && <FactionSelect value={card.faction} setValue={(value) => handleChange("faction", value)} isDisabled={isDisabled("faction")}/>}
                    {isVisible("loyal") && <LoyalButton value={card.loyal} setValue={(value) => handleChange("loyal", value)} isDisabled={isDisabled("loyal")}/>}
                </div>
                {isVisible("type") && <TypeSelect value={card.type} setValue={(value) => handleChange("type", value)} isDisabled={isDisabled("type")}/>}
            </div>
            <div className="flex gap-1 items-center">
                {isVisible("cost") && <CostInput className="max-w-24" value={card.cost} setValue={(value) => handleChange("cost", value)} isDisabled={isDisabled("cost")}/>}
                <div className="grow flex overflow-hidden">
                    {isVisible("unique") && <UniqueButton className="rounded-l-xl" value={card.unique} setValue={(value) => handleChange("unique", value)} isDisabled={isDisabled("unique")}/>}
                    {isVisible("name") && <Input name="name" className="grow" classNames={{ inputWrapper: isVisible("unique") ? "rounded-r-xl" : "rounded-xl" }} radius="none" label="Name" value={card.name ?? ""} onValueChange={(value) => handleChange("name", value)} isDisabled={isDisabled("name")}>
                        {card.name}
                    </Input>}
                </div>
            </div>
            {
                isVisible("strength", "icons") &&
                    <div className="flex gap-1 items-center">
                        {isVisible("strength") && <StrengthInput value={card.strength} setValue={(value) => handleChange("strength", value)} isDisabled={isDisabled("strength")}/>}
                        {isVisible("icons") && <ChallengeIconButtons value={card.icons} setValue={(value) => handleChange("icons", value)} isDisabled={isDisabled("icons")}/>}
                    </div>
            }
            {
                isVisible("plotStats") && <PlotStatInputs value={card.plotStats} setValue={(value) => handleChange("plotStats", value)} isDisabled={isDisabled("plotStats")}/>
            }
            {
                isVisible("traits", "text") &&
                    <div className="flex flex-col space-y-2">
                        {isVisible("traits") && <TraitsInput value={card.traits} setValue={(value) => handleChange("traits", value)} isDisabled={isDisabled("traits")}/>}
                        {isVisible("text") && <AbilityTextEditor value={card.text} setValue={(value) => handleChange("text", value)} isDisabled={isDisabled("text")}/>}
                    </div>
            }
            {
                isVisible("flavor", "designer", "deckLimit") &&
                    <Accordion isCompact={true}>
                        <AccordionItem key="additional" title="Additional Options">
                            <div className="space-y-2">
                                {isVisible("flavor") && <Textarea label="Flavor Text" value={card.flavor ?? ""} onValueChange={(value) => handleChange("flavor", value)} isDisabled={isDisabled("flavor")}>
                                    {card.flavor}
                                </Textarea>}
                                {isVisible("designer") && <Textarea label="Designer" value={card.designer ?? ""} onValueChange={(value) => handleChange("designer", value)} isDisabled={isDisabled("designer")}>
                                    {card.designer}
                                </Textarea>}
                                {isVisible("deckLimit") && <NumberInput label="Deck Limit" value={card.deckLimit ?? DefaultDeckLimit[card.type!]} onValueChange={(value) => handleChange("deckLimit", value)} minValue={1} maxValue={DefaultDeckLimit[card.type!]} isDisabled={isDisabled("deckLimit")}/>}
                            </div>
                        </AccordionItem>
                    </Accordion>
            }
        </div>
    );
};

type CardEditorProps = Omit<BaseElementProps, "children"> & { card?: DeepPartial<ICard>, onUpdate?: (card: DeepPartial<ICard>) => void, inputOptions?: InputOptions }
type InputOptions = { [K in keyof ICard]?: "disabled" | "hidden" };

type VisibilityOptions = { [K in keyof ICard]?: boolean }

export default CardEditor;