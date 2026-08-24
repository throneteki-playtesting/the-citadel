import { Button, ButtonGroup, Input, Select, SelectItem, Textarea } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import ThronesIcon from "../../thronesIcon";
import { factionNames, typeNames } from "common/utils";
import {
    Cost as CostType,
    Strength as StrengthType,
    factions,
    Faction as FactionType,
    types,
    Type as TypeType,
    Icons as IconsType,
    PlotStats as PlotStatsType,
    PlotValue as PlotValueType,
    DefaultDeckLimit
} from "common/models/cards";
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import classNames from "classnames";
import { BaseElementProps } from "../../../types";
import ComboBox from "../../combobox";
import { DeepPartial } from "common/types";
import { useDeferredCallback } from "../../../hooks/useDeferredCallback";
import { useFieldName } from "../fieldPrefixContext";
import { FlavorKind, flavorTextIssue, parseFlavor, serialiseFlavor } from "./flavorText";

const RemoveFieldButton = ({
    label,
    isDisabled,
    onPress
}: {
    label: string;
    isDisabled?: boolean;
    onPress: () => void;
}) => (
    <Button
        isIconOnly={true}
        size="sm"
        variant="light"
        aria-label={label}
        className="text-foreground/40"
        isDisabled={isDisabled}
        onPress={onPress}
    >
        <FontAwesomeIcon icon={faXmark} className="text-xs" />
    </Button>
);

type CustomSetterProps<T> = Omit<BaseElementProps, "children"> & {
    value?: T;
    setValue: Dispatch<SetStateAction<T | undefined>>;
    isDisabled?: boolean;
};

export const FactionSelect = ({
    className,
    style,
    value: faction,
    setValue: setFaction,
    isDisabled
}: CustomSetterProps<FactionType>) => {
    const name = useFieldName("faction");
    return (
        <Select
            name={name}
            className={className}
            style={style}
            label="Faction"
            startContent={faction && <ThronesIcon name={faction} />}
            selectedKeys={faction ? [faction] : []}
            onChange={(e) => setFaction(e.target.value as FactionType)}
            isDisabled={isDisabled}
        >
            {factions.map((faction) => (
                <SelectItem key={faction} startContent={<ThronesIcon name={faction} />}>
                    {factionNames[faction]}
                </SelectItem>
            ))}
        </Select>
    );
};

export const TypeSelect = ({
    className,
    style,
    value: type,
    setValue: setType,
    isDisabled
}: CustomSetterProps<TypeType>) => {
    const name = useFieldName("type");
    return (
        <Select
            name={name}
            className={className}
            style={style}
            label="Type"
            startContent={type && <ThronesIcon name={type} />}
            selectedKeys={type ? [type] : []}
            onChange={(e) => setType(e.target.value as TypeType)}
            isDisabled={isDisabled}
        >
            {types.map((type) => (
                <SelectItem key={type} startContent={<ThronesIcon name={type} />}>
                    {typeNames[type]}
                </SelectItem>
            ))}
        </Select>
    );
};

export const UniqueButton = ({
    className,
    style,
    value: unique,
    setValue: setUnique,
    isDisabled
}: CustomSetterProps<boolean>) => {
    return (
        <Button
            className={classNames("w-14 h-14", { "text-default-50": !unique }, className)}
            style={style}
            isIconOnly={true}
            size="lg"
            radius="none"
            onPress={() => setUnique(!unique)}
            isDisabled={isDisabled}
        >
            <ThronesIcon name="unique" />
        </Button>
    );
};

export const NameInput = ({
    className,
    style,
    value: name,
    setValue: setName,
    isDisabled,
    hasUniqueButton
}: CustomSetterProps<string> & { hasUniqueButton: boolean }) => {
    const fieldName = useFieldName("name");
    return (
        <Input
            name={fieldName}
            className={className}
            classNames={{ inputWrapper: hasUniqueButton ? "rounded-r-xl" : "rounded-xl" }}
            style={style}
            radius="none"
            label="Name"
            value={name ?? ""}
            onValueChange={setName}
            isDisabled={isDisabled}
        >
            {name}
        </Input>
    );
};

export const LoyalButton = ({
    className,
    style,
    value: loyal,
    setValue: setLoyal,
    isDisabled
}: CustomSetterProps<boolean>) => {
    return (
        <Button
            className={classNames("w-14 h-14", { "text-default-50": !loyal }, className)}
            style={style}
            size="lg"
            onPress={() => setLoyal(!loyal)}
            isDisabled={isDisabled}
        >
            Loyal
        </Button>
    );
};

export const CostInput = ({ className, style, value: cost, setValue, isDisabled }: CustomSetterProps<CostType>) => {
    const name = useFieldName("cost");
    const setCost = (value: string) => {
        let cost: CostType | undefined = undefined;
        if (value?.toUpperCase().startsWith("X")) {
            cost = "X";
        } else if (value?.startsWith("-")) {
            cost = "-";
        } else {
            const asNumber = parseInt(value);
            if (!isNaN(asNumber)) {
                cost = asNumber;
            }
        }
        setValue(cost);
    };
    return (
        <Input
            name={name}
            className={className}
            style={style}
            label="Cost"
            value={cost?.toString() ?? ""}
            onValueChange={setCost}
            isDisabled={isDisabled}
        >
            {cost?.toString()}
        </Input>
    );
};

export const ChallengeIconButtons = ({
    className,
    style,
    value: challengeIcons = {},
    setValue: setChallengeIcons,
    isDisabled
}: CustomSetterProps<DeepPartial<IconsType>>) => {
    const toggleIcon = (icon: keyof IconsType) => {
        const newChallengeIcons = { ...challengeIcons };
        newChallengeIcons[icon] = !(challengeIcons[icon] ?? false);
        setChallengeIcons(newChallengeIcons);
    };
    return (
        <ButtonGroup className={className} style={style} size="lg" isDisabled={isDisabled}>
            <Button
                className={classNames("w-14 h-14", { "text-default-50": !challengeIcons?.military }, className)}
                isIconOnly={true}
                onPress={() => toggleIcon("military")}
            >
                <ThronesIcon name="military" />
            </Button>
            <Button
                className={classNames("w-14 h-14", { "text-default-50": !challengeIcons?.intrigue }, className)}
                isIconOnly={true}
                onPress={() => toggleIcon("intrigue")}
            >
                <ThronesIcon name="intrigue" />
            </Button>
            <Button
                className={classNames("w-14 h-14", { "text-default-50": !challengeIcons?.power }, className)}
                isIconOnly={true}
                onPress={() => toggleIcon("power")}
            >
                <ThronesIcon name="power" />
            </Button>
        </ButtonGroup>
    );
};

export const StrengthInput = ({
    className,
    style,
    value: strength,
    setValue,
    isDisabled
}: CustomSetterProps<StrengthType>) => {
    const name = useFieldName("strength");
    const setStrength = (value: string) => {
        let strength: StrengthType | undefined = undefined;
        if (value?.toUpperCase().startsWith("X")) {
            strength = "X";
        } else {
            const asNumber = parseInt(value);
            if (!isNaN(asNumber)) {
                strength = asNumber;
            }
        }
        setValue(strength);
    };

    return (
        <Input
            name={name}
            className={className}
            style={style}
            label="Strength"
            value={strength?.toString() ?? ""}
            onValueChange={setStrength}
            isDisabled={isDisabled}
        >
            {strength?.toString()}
        </Input>
    );
};

export const TraitsInput = ({
    className,
    style,
    value: traits,
    setValue: setTraits,
    isDisabled
}: CustomSetterProps<string[]>) => {
    const name = useFieldName("traits");
    const setValue = (items: string[]) => {
        // Removes any trailing dots, then keeps the chips reading as a sorted list regardless of add order
        const cleanedItems = items.map((item) => item.replace(/\.+$/, "")).sort((a, b) => a.localeCompare(b));
        setTraits(cleanedItems);
    };
    return (
        <ComboBox
            name={name}
            className={className}
            style={style}
            label="Traits"
            values={traits}
            placeholder="Type and press enter"
            onChange={setValue}
            isDisabled={isDisabled}
            chip={{ color: "default", variant: "flat", className: "rounded-sm p-0 pr-0.5 border-1 border-content2" }}
            addKeys={["Enter", "."]}
        />
    );
};

export const PlotStatInputs = ({
    className,
    style,
    value: plotStats,
    setValue: setPlotStats,
    isDisabled
}: Omit<CustomSetterProps<DeepPartial<PlotStatsType>>, "errorMessage"> & {
    errorMessages?: { [K in keyof PlotStatsType]?: string };
}) => {
    const incomeName = useFieldName("plotStats.income");
    const initiativeName = useFieldName("plotStats.initiative");
    const claimName = useFieldName("plotStats.claim");
    const reserveName = useFieldName("plotStats.reserve");
    const setValue = (type: keyof PlotStatsType, value: string) => {
        let statValue: PlotValueType | undefined = undefined;
        if (value?.toUpperCase().startsWith("X")) {
            statValue = "X";
        } else {
            const asNumber = parseInt(value);
            if (!isNaN(asNumber)) {
                statValue = asNumber;
            }
        }
        setPlotStats({ ...plotStats, [type]: statValue });
    };
    return (
        <div className={classNames("grid grid-cols-2 gap-2", className)} style={style}>
            <Input
                name={incomeName}
                className={className}
                style={style}
                label="Income"
                value={plotStats?.income?.toString() ?? ""}
                onValueChange={(value) => setValue("income", value)}
                isDisabled={isDisabled}
            >
                {plotStats?.income}
            </Input>
            <Input
                name={initiativeName}
                className={className}
                style={style}
                label="Initiative"
                value={plotStats?.initiative?.toString() ?? ""}
                onValueChange={(value) => setValue("initiative", value)}
                isDisabled={isDisabled}
            >
                {plotStats?.initiative}
            </Input>
            <Input
                name={claimName}
                className={className}
                style={style}
                label="Claim"
                value={plotStats?.claim?.toString() ?? ""}
                onValueChange={(value) => setValue("claim", value)}
                isDisabled={isDisabled}
            >
                {plotStats?.claim}
            </Input>
            <Input
                name={reserveName}
                className={className}
                style={style}
                label="Reserve"
                value={plotStats?.reserve?.toString() ?? ""}
                onValueChange={(value) => setValue("reserve", value)}
                isDisabled={isDisabled}
            >
                {plotStats?.reserve}
            </Input>
        </div>
    );
};

export const DesignerInput = ({
    className,
    style,
    value: designer,
    setValue: setDesigner,
    isDisabled,
    onRemove
}: CustomSetterProps<string> & { onRemove: () => void }) => {
    const name = useFieldName("designer");
    return (
        <Input
            name={name}
            className={className}
            style={style}
            label="Designer"
            value={designer ?? ""}
            onValueChange={setDesigner}
            isDisabled={isDisabled}
            endContent={<RemoveFieldButton label="Remove designer" isDisabled={isDisabled} onPress={onRemove} />}
        >
            {designer}
        </Input>
    );
};

// A stepper rather than a free-entry number - every card type has a fixed ceiling (DefaultDeckLimit).
// Always present (not add/removeable), built from the same Button/ButtonGroup as the Add buttons beside it
export const DeckLimitStepper = ({
    className,
    style,
    value: deckLimit,
    setValue: setDeckLimit,
    cardType,
    isDisabled
}: CustomSetterProps<number> & { cardType?: TypeType }) => {
    const maxLimit = DefaultDeckLimit[cardType ?? "character"];
    const label = cardType === "plot" ? "Plot Deck Limit" : "Deck Limit";
    const current = deckLimit ?? maxLimit;
    const step = (delta: number) => setDeckLimit(Math.min(maxLimit, Math.max(1, current + delta)));

    return (
        <ButtonGroup size="sm" className={classNames("self-start", className)} style={style} isDisabled={isDisabled}>
            <Button
                isIconOnly={true}
                variant="flat"
                aria-label={`Decrease ${label.toLowerCase()}`}
                isDisabled={isDisabled || current <= 1}
                onPress={() => step(-1)}
            >
                <FontAwesomeIcon icon={faMinus} />
            </Button>
            <Button variant="flat" className="pointer-events-none font-medium" tabIndex={-1}>
                {label}: {current}
            </Button>
            <Button
                isIconOnly={true}
                variant="flat"
                aria-label={`Increase ${label.toLowerCase()}`}
                isDisabled={isDisabled || current >= maxLimit}
                onPress={() => step(1)}
            >
                <FontAwesomeIcon icon={faPlus} />
            </Button>
        </ButtonGroup>
    );
};

const FLAVOR_KIND_LABELS: Record<FlavorKind, string> = {
    passage: "Narration",
    person: "Quote",
    self: "Self-Quote"
};

const FLAVOR_KIND_PLACEHOLDERS: Record<FlavorKind, string> = {
    passage: "The passage, exactly as written...",
    person: "A quote from a person",
    self: "A quote from this specific character"
};

// Transparent while valid, so it reads as part of the toolbar's own box rather than a field of its own.
// Only while valid: this variant signals isInvalid via the wrapper's background tint, which this would swallow
const flavorTextareaClassNames = (isInvalid: boolean) => ({
    inputWrapper: classNames(
        "shadow-none rounded-none",
        !isInvalid &&
            "bg-transparent data-[hover=true]:bg-transparent group-data-[focus=true]:bg-transparent group-data-[focus-visible=true]:bg-transparent"
    )
});

// Flavor text comes in three shapes - see flavorText.ts - picked with a toolbar of kind buttons sitting
// over the textarea itself, the same visual language AbilityEditor uses for its own toolbar
export const FlavorInput = ({
    className,
    style,
    value,
    setValue,
    cardType,
    isUnique,
    isDisabled,
    onRemove
}: CustomSetterProps<string> & { cardType?: TypeType; isUnique?: boolean; onRemove: () => void }) => {
    const flavorName = useFieldName("flavor");
    const [draft, setDraft] = useState(() => parseFlavor(value));
    // What we last sent upward - lets an external change (switching cards, discard) be told apart from our own echo
    const lastEmitted = useRef(value);

    // A self quote is credited to "this" character, so it only makes sense on one there's only one of
    const canSelfQuote = cardType === "character" && !!isUnique;
    const availableKinds: FlavorKind[] = canSelfQuote ? ["passage", "person", "self"] : ["passage", "person"];

    // Fall back if the card stops being a unique character while a self quote is selected
    useEffect(() => {
        if (draft.kind === "self" && !canSelfQuote) {
            setDraft((prev) => ({ ...prev, kind: "passage" }));
        }
    }, [canSelfQuote, draft.kind]);

    useEffect(() => {
        if (value !== lastEmitted.current) {
            lastEmitted.current = value;
            setDraft(parseFlavor(value));
        }
    }, [value]);

    // Emitting upward re-renders the whole CardEditor tree, which held keys otherwise pay for on every
    // repeat - deferred the same way AbilityEditor defers its own emit
    const { schedule, flush } = useDeferredCallback(() => {
        const serialised = serialiseFlavor(draft.kind, draft.text, draft.person);
        if (serialised !== lastEmitted.current) {
            lastEmitted.current = serialised;
            setValue(serialised);
        }
    });
    useEffect(() => {
        schedule();
    }, [draft, schedule]);

    const issue = flavorTextIssue(draft.kind, draft.text);
    const setKind = (kind: FlavorKind) => setDraft((prev) => ({ ...prev, kind }));
    const setText = (text: string) => setDraft((prev) => ({ ...prev, text }));
    const setPerson = (person: string) => setDraft((prev) => ({ ...prev, person }));

    return (
        <div className={classNames("flex flex-col gap-1", className)} style={style}>
            <div className="flex flex-col bg-default-100 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between gap-1 bg-default p-1">
                    <ButtonGroup size="sm">
                        {availableKinds.map((kind) => (
                            <Button
                                key={kind}
                                color={draft.kind === kind ? "primary" : "default"}
                                variant={draft.kind === kind ? "solid" : "light"}
                                isDisabled={isDisabled}
                                onPress={() => setKind(kind)}
                            >
                                {FLAVOR_KIND_LABELS[kind]}
                            </Button>
                        ))}
                    </ButtonGroup>
                    <RemoveFieldButton label="Remove flavor text" isDisabled={isDisabled} onPress={onRemove} />
                </div>
                <Textarea
                    name={flavorName}
                    aria-label={FLAVOR_KIND_LABELS[draft.kind]}
                    placeholder={FLAVOR_KIND_PLACEHOLDERS[draft.kind]}
                    minRows={2}
                    value={draft.text}
                    onValueChange={setText}
                    onBlur={flush}
                    isDisabled={isDisabled}
                    isInvalid={!!issue}
                    classNames={flavorTextareaClassNames(!!issue)}
                >
                    {draft.text}
                </Textarea>
                {draft.kind === "person" && (
                    <div className="px-2 pb-2 pt-1 border-t border-content2">
                        <Input
                            aria-label="Quoted by"
                            placeholder="Quoted by..."
                            size="sm"
                            value={draft.person}
                            onValueChange={setPerson}
                            onBlur={flush}
                            isDisabled={isDisabled}
                        >
                            {draft.person}
                        </Input>
                    </div>
                )}
            </div>
            {issue && <div className="text-tiny text-danger px-1">{issue}</div>}
        </div>
    );
};
