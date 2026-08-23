import { Button, Chip, DrawerBody, DrawerFooter, DrawerHeader, Input, SharedSelection } from "@heroui/react";
import { useMemo, useState } from "react";
import { ChallengeIcon, challengeIcons, Faction, factions, Icons, Type, types } from "common/models/cards";
import { factionNames, typeNames, escapeRegExp } from "common/utils";
import ThronesIcon from "../../thronesIcon";
import SearchableMultiSelect from "../searchableMultiSelect";
import { ToggleButtonGroup, BooleanToggle, NumericFilterInput } from "../filters";
import { NumericFilterValue, decodeNumericOperators, numericOperators } from "../filters/numeric";
import { CardFilterValue, EMPTY_CARD_FILTER, isCardFilterActive } from "./types";

type InternalState = {
    types: Type[];
    factions: Faction[];
    loyal?: boolean;
    unique?: boolean;
    icons: ChallengeIcon[];
    cost?: NumericFilterValue;
    strength?: NumericFilterValue;
    income?: NumericFilterValue;
    initiative?: NumericFilterValue;
    claim?: NumericFilterValue;
    reserve?: NumericFilterValue;
    name: string;
    text: string;
    flavor: string;
    designer: string;
    traits: string[];
    releases: string[];
};

function decodeText(value: unknown): string {
    if (value && typeof value === "object" && "$regex" in (value as object)) {
        const pattern = (value as { $regex: string }).$regex;
        return pattern.startsWith("(?i)") ? pattern.slice(4) : pattern;
    }
    return typeof value === "string" ? value : "";
}

function decodeArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) {
        return value as T[];
    }
    return value !== undefined ? [value as T] : [];
}

function decode(value: CardFilterValue): InternalState {
    return {
        types: decodeArray<Type>(value.type),
        factions: decodeArray<Faction>(value.faction),
        loyal: typeof value.loyal === "boolean" ? value.loyal : undefined,
        unique: typeof value.unique === "boolean" ? value.unique : undefined,
        icons: challengeIcons.filter((icon) => value.icons?.[icon] === true),
        cost: decodeNumericOperators(value.cost),
        strength: decodeNumericOperators(value.strength),
        income: decodeNumericOperators(value.plotStats?.income),
        initiative: decodeNumericOperators(value.plotStats?.initiative),
        claim: decodeNumericOperators(value.plotStats?.claim),
        reserve: decodeNumericOperators(value.plotStats?.reserve),
        name: decodeText(value.name),
        text: decodeText(value.text),
        flavor: decodeText(value.flavor),
        designer: decodeText(value.designer),
        traits: value.traits ?? [],
        releases: value.releases ?? []
    };
}

function textFilter(raw: string): { $regex: string } | undefined {
    const trimmed = raw.trim();
    return trimmed ? { $regex: `(?i)${escapeRegExp(trimmed)}` } : undefined;
}

function compose(state: InternalState): CardFilterValue {
    const icons: Partial<Icons> = {};
    for (const icon of state.icons) {
        icons[icon] = true;
    }
    const hasPlotStats = state.income || state.initiative || state.claim || state.reserve;

    return {
        type: state.types.length > 0 ? state.types : undefined,
        faction: state.factions.length > 0 ? state.factions : undefined,
        loyal: state.loyal,
        unique: state.unique,
        icons: state.icons.length > 0 ? icons : undefined,
        // Cost/Strength/PlotValue are number unions ("X" | number), which breaks
        // ComparableOperators' conditional matching for $lt/$gt - see filters/numeric.ts
        cost: numericOperators(state.cost) as CardFilterValue["cost"],
        strength: numericOperators(state.strength) as CardFilterValue["strength"],
        plotStats: hasPlotStats
            ? {
                  income: numericOperators(state.income) as NonNullable<CardFilterValue["plotStats"]>["income"],
                  initiative: numericOperators(
                      state.initiative
                  ) as NonNullable<CardFilterValue["plotStats"]>["initiative"],
                  claim: numericOperators(state.claim) as NonNullable<CardFilterValue["plotStats"]>["claim"],
                  reserve: numericOperators(state.reserve) as NonNullable<CardFilterValue["plotStats"]>["reserve"]
              }
            : undefined,
        name: textFilter(state.name),
        text: textFilter(state.text),
        flavor: textFilter(state.flavor),
        designer: textFilter(state.designer),
        traits: state.traits.length > 0 ? state.traits : undefined,
        releases: state.releases.length > 0 ? state.releases : undefined
    };
}

// Shared by every "chips with an x to remove one" multiselect section below
function renderChips(items: string[], onRemove: (item: string) => void) {
    return (
        <div className="flex flex-wrap gap-1 py-1">
            {items.map((item) => (
                <Chip key={item} variant="flat" onClose={() => onRemove(item)}>
                    {item}
                </Chip>
            ))}
        </div>
    );
}

type MultiSelectFieldProps = {
    // Omit when the search placeholder alone already makes the field's purpose clear
    label?: string;
    placeholder: string;
    options: string[];
    value: string[];
    onChange: (value: string[]) => void;
};

// Search, per-chip clear and clear-all over a plain string option list. Already-selected values stay
// visible even once filtered out by the search, so their chip never silently loses its label.
function MultiSelectField({ label, placeholder, options, value, onChange }: MultiSelectFieldProps) {
    const [search, setSearch] = useState("");

    // SearchableMultiSelect requires object items (its "sentinel" trick needs a real reference to
    // compare against) - wrap each option, same convention as tagFilter.tsx's `{ tag }` wrapping.
    const items = useMemo(() => {
        const term = search.trim().toLowerCase();
        const filtered = term ? options.filter((option) => option.toLowerCase().includes(term)) : options;
        const missingSelected = value.filter((selected) => !filtered.includes(selected));
        return [...missingSelected, ...filtered].map((key) => ({ key }));
    }, [options, search, value]);

    const handleSelectionChange = (keys: SharedSelection) => {
        onChange(keys === "all" ? items.map((item) => item.key) : ([...keys] as string[]));
    };

    return (
        <div className="flex flex-col gap-1">
            {(label || value.length > 0) && (
                <div className="flex items-center justify-between">
                    <div className="text-xs text-default-500">{label}</div>
                    {value.length > 0 && (
                        <button
                            type="button"
                            className="text-xs text-primary hover:underline"
                            onClick={() => onChange([])}
                        >
                            Clear
                        </button>
                    )}
                </div>
            )}
            <SearchableMultiSelect
                size="sm"
                placeholder={placeholder}
                items={items}
                getKey={(item) => item.key}
                renderItem={(item) => item.key}
                renderSelected={(selected) =>
                    renderChips(
                        selected.map((item) => item.key),
                        (key) => onChange(value.filter((v) => v !== key))
                    )
                }
                selectedKeys={value}
                onSelectionChange={handleSelectionChange}
                search={search}
                onSearchChange={setSearch}
                hasMore={false}
                onLoadMore={() => undefined}
            />
        </div>
    );
}

type CardFilterDrawerProps = {
    value: CardFilterValue;
    onChange: (value: CardFilterValue) => void;
    traits: string[];
    releases?: { code: string; name: string }[];
    onClose: () => void;
};

const CardFilterDrawer = ({ value, onChange, traits, releases, onClose }: CardFilterDrawerProps) => {
    const [internal, setInternal] = useState<InternalState>(() => decode(value));

    const update = (patch: Partial<InternalState>) => {
        const next = { ...internal, ...patch };
        setInternal(next);
        onChange(compose(next));
    };

    const clearAll = () => {
        setInternal(decode(EMPTY_CARD_FILTER));
        onChange(EMPTY_CARD_FILTER);
    };

    const releaseCodes = useMemo(() => (releases ?? []).map((release) => release.code), [releases]);

    return (
        <>
            <DrawerHeader>Filter Cards</DrawerHeader>
            <DrawerBody className="gap-2 py-2">
                <Input label="Name" size="sm" value={internal.name} onValueChange={(name) => update({ name })} />
                <MultiSelectField
                    placeholder="Search traits..."
                    options={traits}
                    value={internal.traits}
                    onChange={(traits) => update({ traits })}
                />
                <ToggleButtonGroup
                    options={factions.map((faction) => ({
                        key: faction,
                        label: factionNames[faction],
                        icon: <ThronesIcon name={faction} />
                    }))}
                    value={internal.factions}
                    onChange={(factions) => update({ factions })}
                />
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                    <ToggleButtonGroup
                        options={types.map((type) => ({
                            key: type,
                            label: typeNames[type],
                            icon: <ThronesIcon name={type} />
                        }))}
                        value={internal.types}
                        onChange={(types) => update({ types })}
                    />
                    <ToggleButtonGroup
                        options={challengeIcons.map((icon) => ({
                            key: icon,
                            label: icon,
                            icon: <ThronesIcon name={icon} />
                        }))}
                        value={internal.icons}
                        onChange={(icons) => update({ icons })}
                    />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                    <BooleanToggle
                        trueLabel="Loyal"
                        falseLabel="Non-Loyal"
                        value={internal.loyal}
                        onChange={(loyal) => update({ loyal })}
                    />
                    <BooleanToggle
                        trueLabel="Unique"
                        falseLabel="Non-Unique"
                        value={internal.unique}
                        onChange={(unique) => update({ unique })}
                    />
                </div>
                <Input label="Text" size="sm" value={internal.text} onValueChange={(text) => update({ text })} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <NumericFilterInput label="Cost" value={internal.cost} onChange={(cost) => update({ cost })} />
                    <NumericFilterInput
                        label="Strength"
                        value={internal.strength}
                        onChange={(strength) => update({ strength })}
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <NumericFilterInput label="Income" value={internal.income} onChange={(income) => update({ income })} />
                    <NumericFilterInput
                        label="Initiative"
                        value={internal.initiative}
                        onChange={(initiative) => update({ initiative })}
                    />
                    <NumericFilterInput label="Claim" value={internal.claim} onChange={(claim) => update({ claim })} />
                    <NumericFilterInput
                        label="Reserve"
                        value={internal.reserve}
                        onChange={(reserve) => update({ reserve })}
                    />
                </div>
                <Input
                    label="Flavor"
                    size="sm"
                    value={internal.flavor}
                    onValueChange={(flavor) => update({ flavor })}
                />
                <Input
                    label="Designer"
                    size="sm"
                    value={internal.designer}
                    onValueChange={(designer) => update({ designer })}
                />
                {releaseCodes.length > 0 && (
                    <MultiSelectField
                        placeholder="Search release codes..."
                        options={releaseCodes}
                        value={internal.releases}
                        onChange={(releases) => update({ releases })}
                    />
                )}
            </DrawerBody>
            <DrawerFooter>
                <Button variant="flat" onPress={clearAll} isDisabled={!isCardFilterActive(value)}>
                    Clear all
                </Button>
                <Button color="primary" onPress={onClose}>
                    Done
                </Button>
            </DrawerFooter>
        </>
    );
};

export default CardFilterDrawer;
