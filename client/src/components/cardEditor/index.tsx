import { DefaultDeckLimit, ICard } from "common/models/cards";
import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import {
    ChallengeIconButtons,
    CostInput,
    DeckLimitStepper,
    DesignerInput,
    FactionSelect,
    FlavorInput,
    LoyalButton,
    NameInput,
    PlotStatInputs,
    StrengthInput,
    TraitsInput,
    TypeSelect,
    UniqueButton
} from "./components/editorComponents";
import AbilityTextEditor from "./components/abilityEditor";
import { Button } from "@heroui/react";
import { DeepPartial } from "common/types";
import { BaseElementProps } from "../../types";
import classNames from "classnames";
import { FieldPrefixContext } from "./fieldPrefixContext";

type OptionalField = "flavor" | "designer";

const defaultVisibility: VisibilityOptions = { type: true, faction: true };

const CardEditor = ({
    className,
    style,
    card: initial,
    inputOptions = {},
    for: fieldFor,
    onUpdate = () => true
}: CardEditorProps) => {
    const [card, setCard] = useState<DeepPartial<ICard>>({});
    const [visibility, setVisibility] = useState<VisibilityOptions>(defaultVisibility);

    const isDisabled = useCallback((name: keyof ICard) => inputOptions[name] === "disabled", [inputOptions]);
    const isVisible = useCallback(
        (...names: (keyof ICard)[]) => names.some((name) => visibility[name] && inputOptions[name] !== "hidden"),
        [inputOptions, visibility]
    );

    // Which optional fields are showing their input rather than an "Add" button - kept apart from the
    // card's own values, since an added-but-not-yet-typed field is still empty but must stay visible
    const [addedFields, setAddedFields] = useState<Set<OptionalField>>(new Set());

    // What we last handed to onUpdate - callers echo this same reference back as `card` next render.
    // Without this guard that reads as "a different card loaded", closing a field the instant it empties
    const lastEmitted = useRef<DeepPartial<ICard> | undefined>(undefined);

    useEffect(() => {
        if (initial === lastEmitted.current) {
            return;
        }
        lastEmitted.current = initial;
        setCard(initial ?? {});
        const data = initial ?? {};
        setAddedFields(
            new Set((["flavor", "designer"] as OptionalField[]).filter((field) => data[field] !== undefined))
        );
    }, [initial]);

    const applyDefaults = (card: DeepPartial<ICard>) => {
        const defaults: DeepPartial<ICard> = {
            traits: card.traits ?? []
        };
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

        // An added-but-emptied field saves as absent, not as "" - the Add/Remove toggle is a display
        // concern only, tracked separately in addedFields
        if (!card.flavor?.trim()) {
            delete card.flavor;
        }
        if (!card.designer?.trim()) {
            delete card.designer;
        }

        // Always present once a type is chosen - clamped rather than reset, so a still-valid custom
        // value survives a type change and only an out-of-range one gets pulled back down
        if (card.type) {
            const maxLimit = DefaultDeckLimit[card.type];
            defaults.deckLimit = Math.min(card.deckLimit ?? maxLimit, maxLimit);
        } else {
            delete card.deckLimit;
        }

        return { ...card, ...defaults };
    };

    const handleChange = useCallback(
        (field: keyof ICard, value: unknown) => {
            const updated = applyDefaults({ ...card, [field]: value });
            setCard(updated);
            lastEmitted.current = updated;
            onUpdate(updated);
        },
        [card, onUpdate]
    );

    const addField = useCallback((field: OptionalField) => {
        setAddedFields((prev) => new Set(prev).add(field));
    }, []);

    const removeField = useCallback(
        (field: OptionalField) => {
            setAddedFields((prev) => {
                const next = new Set(prev);
                next.delete(field);
                return next;
            });
            handleChange(field, undefined);
        },
        [handleChange]
    );

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
        <FieldPrefixContext.Provider value={fieldFor}>
            <div className={classNames("space-y-2 w-full", className)} style={style}>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap md:flex-col lg:flex-row lg:flex-wrap">
                    <div className="flex gap-2 w-full">
                        {isVisible("faction") && (
                            <FactionSelect
                                value={card.faction}
                                setValue={(value) => handleChange("faction", value)}
                                isDisabled={isDisabled("faction")}
                            />
                        )}
                        {isVisible("loyal") && (
                            <LoyalButton
                                value={card.loyal}
                                setValue={(value) => handleChange("loyal", value)}
                                isDisabled={isDisabled("loyal")}
                            />
                        )}
                    </div>
                    {isVisible("type") && (
                        <TypeSelect
                            value={card.type}
                            setValue={(value) => handleChange("type", value)}
                            isDisabled={isDisabled("type")}
                        />
                    )}
                </div>
                <div className="flex gap-1 items-center">
                    {isVisible("cost") && (
                        <CostInput
                            className="max-w-24"
                            value={card.cost}
                            setValue={(value) => handleChange("cost", value)}
                            isDisabled={isDisabled("cost")}
                        />
                    )}
                    <div className="grow flex">
                        {isVisible("unique") && (
                            <UniqueButton
                                className="rounded-l-xl"
                                value={card.unique}
                                setValue={(value) => handleChange("unique", value)}
                                isDisabled={isDisabled("unique")}
                            />
                        )}
                        {isVisible("name") && (
                            <NameInput
                                className="grow"
                                value={card.name}
                                setValue={(value) => handleChange("name", value)}
                                isDisabled={isDisabled("name")}
                                hasUniqueButton={isVisible("unique")}
                            />
                        )}
                    </div>
                </div>
                {isVisible("strength", "icons") && (
                    <div className="flex gap-1 items-center">
                        {isVisible("strength") && (
                            <StrengthInput
                                value={card.strength}
                                setValue={(value) => handleChange("strength", value)}
                                isDisabled={isDisabled("strength")}
                            />
                        )}
                        {isVisible("icons") && (
                            <ChallengeIconButtons
                                value={card.icons}
                                setValue={(value) => handleChange("icons", value)}
                                isDisabled={isDisabled("icons")}
                            />
                        )}
                    </div>
                )}
                {isVisible("plotStats") && (
                    <PlotStatInputs
                        value={card.plotStats}
                        setValue={(value) => handleChange("plotStats", value)}
                        isDisabled={isDisabled("plotStats")}
                    />
                )}
                {isVisible("traits", "text") && (
                    <div className="flex flex-col space-y-2">
                        {isVisible("traits") && (
                            <TraitsInput
                                value={card.traits}
                                setValue={(value) => handleChange("traits", value)}
                                isDisabled={isDisabled("traits")}
                            />
                        )}
                        {isVisible("text") && (
                            <AbilityTextEditor
                                value={card.text}
                                setValue={(value) => handleChange("text", value)}
                                isDisabled={isDisabled("text")}
                            />
                        )}
                    </div>
                )}
                {isVisible("flavor", "designer", "deckLimit") && (
                    <div className="flex flex-col gap-2">
                        {isVisible("flavor") && addedFields.has("flavor") && (
                            <FlavorInput
                                value={card.flavor}
                                setValue={(value) => handleChange("flavor", value)}
                                cardType={card.type}
                                isUnique={card.unique}
                                isDisabled={isDisabled("flavor")}
                                onRemove={() => removeField("flavor")}
                            />
                        )}
                        {isVisible("designer") && addedFields.has("designer") && (
                            <DesignerInput
                                value={card.designer}
                                setValue={(value) => handleChange("designer", value)}
                                isDisabled={isDisabled("designer")}
                                onRemove={() => removeField("designer")}
                            />
                        )}
                        <div className="flex flex-wrap gap-2 items-center">
                            {isVisible("deckLimit") && !isDisabled("deckLimit") && (
                                <DeckLimitStepper
                                    value={card.deckLimit}
                                    setValue={(value) => handleChange("deckLimit", value)}
                                    cardType={card.type}
                                    isDisabled={isDisabled("deckLimit")}
                                />
                            )}
                            {isVisible("flavor") && !addedFields.has("flavor") && !isDisabled("flavor") && (
                                <Button
                                    variant="flat"
                                    size="sm"
                                    startContent={<FontAwesomeIcon icon={faPlus} />}
                                    onPress={() => addField("flavor")}
                                >
                                    Add Flavor Text
                                </Button>
                            )}
                            {isVisible("designer") && !addedFields.has("designer") && !isDisabled("designer") && (
                                <Button
                                    variant="flat"
                                    size="sm"
                                    startContent={<FontAwesomeIcon icon={faPlus} />}
                                    onPress={() => addField("designer")}
                                >
                                    Add Designer
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </FieldPrefixContext.Provider>
    );
};

type CardEditorProps = Omit<BaseElementProps, "children"> & {
    card?: DeepPartial<ICard>;
    onUpdate?: (card: DeepPartial<ICard>) => void;
    inputOptions?: InputOptions;
    for?: string;
};
type InputOptions = { [K in keyof ICard]?: "disabled" | "hidden" };

type VisibilityOptions = { [K in keyof ICard]?: boolean };

export default CardEditor;
