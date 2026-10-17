import { DefaultDeckLimit, ICard, uniqueTypes } from "common/models/cards";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { isEqual } from "lodash-es";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import {
    ChallengeIconButtons as ChallengeIconButtonsBase,
    CostInput as CostInputBase,
    DeckLimitStepper as DeckLimitStepperBase,
    DesignerInput as DesignerInputBase,
    FactionSelect as FactionSelectBase,
    FlavorInput as FlavorInputBase,
    LoyalButton as LoyalButtonBase,
    NameInput as NameInputBase,
    PlotStatInputs as PlotStatInputsBase,
    StrengthInput as StrengthInputBase,
    TraitsInput as TraitsInputBase,
    TypeSelect as TypeSelectBase,
    UniqueButton as UniqueButtonBase
} from "./components/editorComponents";
import AbilityTextEditor from "./components/abilityEditor";
import { Button } from "@heroui/react";
import { DeepPartial } from "common/types";
import { BaseElementProps } from "../../types";
import classNames from "classnames";
import { FieldPrefixContext } from "./fieldPrefixContext";

// Memoised so an edit to one field leaves the others alone
const ChallengeIconButtons = memo(ChallengeIconButtonsBase);
const CostInput = memo(CostInputBase);
const DeckLimitStepper = memo(DeckLimitStepperBase);
const DesignerInput = memo(DesignerInputBase);
const FactionSelect = memo(FactionSelectBase);
const FlavorInput = memo(FlavorInputBase);
const LoyalButton = memo(LoyalButtonBase);
const NameInput = memo(NameInputBase);
const PlotStatInputs = memo(PlotStatInputsBase);
const StrengthInput = memo(StrengthInputBase);
const TraitsInput = memo(TraitsInputBase);
const TypeSelect = memo(TypeSelectBase);
const UniqueButton = memo(UniqueButtonBase);

type OptionalField = "flavor" | "designer";

const defaultVisibility: VisibilityOptions = { type: true, faction: true };

// Keeps the previous object when nothing in it changed, so the field drawing it doesn't re-render
function reuse<T>(previous: T | undefined, next: T): T {
    return isEqual(previous, next) ? (previous as T) : next;
}

function applyDefaults(card: DeepPartial<ICard>) {
    const defaults: DeepPartial<ICard> = {
        traits: card.traits ?? []
    };
    if (card.type === "character") {
        defaults.icons = reuse(card.icons, {
            military: card.icons?.military ?? false,
            intrigue: card.icons?.intrigue ?? false,
            power: card.icons?.power ?? false
        });
    } else {
        delete card.icons;
    }
    if (card.type && uniqueTypes.includes(card.type)) {
        defaults.unique = card.unique ?? false;
    } else {
        delete card.unique;
    }

    if (card.faction && card.faction !== "neutral" && card.type !== "agenda") {
        defaults.loyal = card.loyal ?? false;
    } else {
        delete card.loyal;
    }

    if (card.type === "plot") {
        defaults.plotStats = reuse(card.plotStats, {
            income: card.plotStats?.income,
            initiative: card.plotStats?.initiative,
            claim: card.plotStats?.claim,
            reserve: card.plotStats?.reserve
        });
    } else {
        delete card.plotStats;
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
}

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

    // Read through a ref so the handlers below don't change with the card
    const cardRef = useRef(card);
    cardRef.current = card;
    const handleChange = useCallback(
        (field: keyof ICard, value: unknown) => {
            const updated = applyDefaults({ ...cardRef.current, [field]: value });
            setCard(updated);
            lastEmitted.current = updated;
            onUpdate(updated);
        },
        [onUpdate]
    );

    // One stable setter per field, so each field's memo holds
    const handleChangeRef = useRef(handleChange);
    handleChangeRef.current = handleChange;
    const setters = useRef(new Map<keyof ICard, (value: unknown) => void>());
    const setterFor = useCallback((field: keyof ICard) => {
        let setter = setters.current.get(field);
        if (!setter) {
            setter = (value) => handleChangeRef.current(field, value);
            setters.current.set(field, setter);
        }
        return setter;
    }, []);

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

    const removeFlavor = useCallback(() => removeField("flavor"), [removeField]);
    const removeDesigner = useCallback(() => removeField("designer"), [removeField]);

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

            if (card.faction && card.faction !== "neutral" && card.type !== "agenda") {
                updated.loyal = true;
            }
        }
        setVisibility(updated);
    }, [card.faction, card.type]);

    return (
        <FieldPrefixContext.Provider value={fieldFor}>
            <div className={classNames("space-y-2 w-full", className)} style={style}>
                <div className="flex flex-wrap gap-2">
                    {isVisible("faction") && (
                        <FactionSelect
                            className="min-w-48 flex-1"
                            value={card.faction}
                            setValue={setterFor("faction")}
                            isDisabled={isDisabled("faction")}
                        />
                    )}
                    {isVisible("loyal") && (
                        <LoyalButton
                            className="shrink-0"
                            value={card.loyal}
                            setValue={setterFor("loyal")}
                            isDisabled={isDisabled("loyal")}
                        />
                    )}
                    {isVisible("type") && (
                        <TypeSelect
                            className="min-w-40 flex-1"
                            value={card.type}
                            setValue={setterFor("type")}
                            isDisabled={isDisabled("type")}
                        />
                    )}
                </div>
                <div className="flex gap-1 items-center">
                    {isVisible("cost") && (
                        <CostInput
                            className="max-w-24"
                            value={card.cost}
                            setValue={setterFor("cost")}
                            isDisabled={isDisabled("cost")}
                        />
                    )}
                    <div className="grow flex">
                        {isVisible("unique") && (
                            <UniqueButton
                                className="rounded-l-xl"
                                value={card.unique}
                                setValue={setterFor("unique")}
                                isDisabled={isDisabled("unique")}
                            />
                        )}
                        {isVisible("name") && (
                            <NameInput
                                className="grow"
                                value={card.name}
                                setValue={setterFor("name")}
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
                                setValue={setterFor("strength")}
                                isDisabled={isDisabled("strength")}
                            />
                        )}
                        {isVisible("icons") && (
                            <ChallengeIconButtons
                                value={card.icons}
                                setValue={setterFor("icons")}
                                isDisabled={isDisabled("icons")}
                            />
                        )}
                    </div>
                )}
                {isVisible("plotStats") && (
                    <PlotStatInputs
                        value={card.plotStats}
                        setValue={setterFor("plotStats")}
                        isDisabled={isDisabled("plotStats")}
                    />
                )}
                {isVisible("traits", "text") && (
                    <div className="flex flex-col space-y-2">
                        {isVisible("traits") && (
                            <TraitsInput
                                value={card.traits}
                                setValue={setterFor("traits")}
                                isDisabled={isDisabled("traits")}
                            />
                        )}
                        {isVisible("text") && (
                            <AbilityTextEditor
                                value={card.text}
                                setValue={setterFor("text")}
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
                                setValue={setterFor("flavor")}
                                cardType={card.type}
                                isUnique={card.unique}
                                isDisabled={isDisabled("flavor")}
                                onRemove={removeFlavor}
                            />
                        )}
                        {isVisible("designer") && addedFields.has("designer") && (
                            <DesignerInput
                                value={card.designer}
                                setValue={setterFor("designer")}
                                isDisabled={isDisabled("designer")}
                                onRemove={removeDesigner}
                            />
                        )}
                        <div className="flex flex-wrap gap-2 items-center">
                            {isVisible("deckLimit") && !isDisabled("deckLimit") && (
                                <DeckLimitStepper
                                    value={card.deckLimit}
                                    setValue={setterFor("deckLimit")}
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

// Memoized deliberately - this hosts the ability text's TipTap editor, the most expensive thing in
// any caller. Only worth anything as long as callers pass stable `onUpdate`/`inputOptions` references.
export default memo(CardEditor);
