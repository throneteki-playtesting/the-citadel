import {
    Button,
    ButtonGroup,
    Chip,
    DrawerBody,
    DrawerFooter,
    DrawerHeader,
    Input,
    SharedSelection
} from "@heroui/react";
import { useMemo, useState } from "react";
import {
    AbilityType,
    abilityTypes,
    ChallengeIcon,
    challengeIcons,
    Faction,
    factions,
    Icons,
    ReactionType,
    Type,
    types
} from "common/models/cards";
import { factionNames, typeNames, escapeRegExp } from "common/utils";
import { REWARD_TYPES, RewardType } from "common/designGuidelines/rewardTypes";
import { PUNISHMENT_TYPES, PunishmentType } from "common/designGuidelines/punishmentTypes";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEyeSlash, faThumbsDown, faThumbsUp, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import ThronesIcon from "../../thronesIcon";
import SearchableMultiSelect from "../searchableMultiSelect";
import { ToggleButtonGroup, BooleanToggle, NumericFilterInput } from "../filters";
import { NumericFilterValue, decodeNumericOperators, numericOperators } from "../filters/numeric";
import { EMPTY_SUGGESTION_FILTER, isSuggestionFilterActive, SuggestionFilterValue } from "./types";

const REACTION_FILTER_OPTIONS: { key: ReactionType; label: string; icon: IconDefinition }[] = [
    { key: "like", label: "Liked", icon: faThumbsUp },
    { key: "dislike", label: "Disliked", icon: faThumbsDown },
    { key: "ignore", label: "Ignored", icon: faEyeSlash }
];

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
    mine: boolean;
    unseen: boolean;
    byUsers: string[];
    approvedFilter?: "awaiting" | "only" | "none";
    myReactions: ReactionType[];
    rewardTypes: RewardType[];
    punishment: PunishmentType[];
    abilityTypes: AbilityType[];
    iconic?: boolean;
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

function decode(value: SuggestionFilterValue): InternalState {
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
        mine: value.mine === true,
        unseen: value.unseen === true,
        byUsers: value.byUsers ?? [],
        approvedFilter: value.approvedFilter,
        myReactions: value.myReactions ?? [],
        rewardTypes: value.rewardTypes ?? [],
        punishment: value.punishment ?? [],
        abilityTypes: value.abilityTypes ?? [],
        iconic: value.iconic
    };
}

function textFilter(raw: string): { $regex: string } | undefined {
    const trimmed = raw.trim();
    return trimmed ? { $regex: `(?i)${escapeRegExp(trimmed)}` } : undefined;
}

function compose(state: InternalState): SuggestionFilterValue {
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
        cost: numericOperators(state.cost) as SuggestionFilterValue["cost"],
        strength: numericOperators(state.strength) as SuggestionFilterValue["strength"],
        plotStats: hasPlotStats
            ? {
                  income: numericOperators(state.income) as NonNullable<SuggestionFilterValue["plotStats"]>["income"],
                  initiative: numericOperators(state.initiative) as NonNullable<
                      SuggestionFilterValue["plotStats"]
                  >["initiative"],
                  claim: numericOperators(state.claim) as NonNullable<SuggestionFilterValue["plotStats"]>["claim"],
                  reserve: numericOperators(state.reserve) as NonNullable<SuggestionFilterValue["plotStats"]>["reserve"]
              }
            : undefined,
        name: textFilter(state.name),
        text: textFilter(state.text),
        flavor: textFilter(state.flavor),
        designer: textFilter(state.designer),
        traits: state.traits.length > 0 ? state.traits : undefined,
        mine: state.mine || undefined,
        unseen: state.unseen || undefined,
        byUsers: state.byUsers.length > 0 ? state.byUsers : undefined,
        approvedFilter: state.approvedFilter,
        myReactions: state.myReactions.length > 0 ? state.myReactions : undefined,
        rewardTypes: state.rewardTypes.length > 0 ? state.rewardTypes : undefined,
        punishment: state.punishment.length > 0 ? state.punishment : undefined,
        abilityTypes: state.abilityTypes.length > 0 ? state.abilityTypes : undefined,
        iconic: state.iconic
    };
}

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

// Same search+chips pattern cardFilterDrawer.tsx's private MultiSelectField uses, generalised to
// id/label pairs so it also covers the reward/punishment registries below (not just bare strings).
type KeyedOption = { key: string; label: string };
type KeyedMultiSelectFieldProps = {
    label?: string;
    placeholder: string;
    options: KeyedOption[];
    value: string[];
    onChange: (value: string[]) => void;
};

function KeyedMultiSelectField({ label, placeholder, options, value, onChange }: KeyedMultiSelectFieldProps) {
    const [search, setSearch] = useState("");

    const items = useMemo(() => {
        const term = search.trim().toLowerCase();
        const filtered = term ? options.filter((option) => option.label.toLowerCase().includes(term)) : options;
        const missingSelected = options.filter(
            (option) => value.includes(option.key) && !filtered.some((f) => f.key === option.key)
        );
        return [...missingSelected, ...filtered];
    }, [options, search, value]);

    const handleSelectionChange = (keys: SharedSelection) => {
        onChange(keys === "all" ? items.map((item) => item.key) : ([...keys] as string[]));
    };

    const selectedLabels = (keys: string[]) =>
        keys.map((key) => options.find((option) => option.key === key)?.label ?? key);

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
                renderItem={(item) => item.label}
                renderSelected={() =>
                    renderChips(selectedLabels(value), (label) => {
                        const key = options.find((option) => option.label === label)?.key;
                        onChange(value.filter((v) => v !== key));
                    })
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

// A ToggleButtonGroup toggles independently per key - resolving the picked key here (rather than
// teaching it a new "exclusive" mode) gives the approval row radio-like behaviour instead.
function pickExclusive<T extends string>(next: T[], previous?: T): T | undefined {
    return next.find((key) => key !== previous);
}

type SuggestionFilterDrawerProps = {
    value: SuggestionFilterValue;
    onChange: (value: SuggestionFilterValue) => void;
    traits: string[];
    users: { discordId: string; displayname: string }[];
    onClose: () => void;
};

const SuggestionFilterDrawer = ({ value, onChange, traits, users, onClose }: SuggestionFilterDrawerProps) => {
    const [internal, setInternal] = useState<InternalState>(() => decode(value));

    const update = (patch: Partial<InternalState>) => {
        const next = { ...internal, ...patch };
        setInternal(next);
        onChange(compose(next));
    };

    const clearAll = () => {
        setInternal(decode(EMPTY_SUGGESTION_FILTER));
        onChange(EMPTY_SUGGESTION_FILTER);
    };

    return (
        <>
            <DrawerHeader>Filter Suggestions</DrawerHeader>
            <DrawerBody className="gap-2 py-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {/* Mutually exclusive - separate button groups since these are independent
                        "which suggestions" angles, not two options on the same axis. */}
                    <ToggleButtonGroup
                        options={[{ key: "mine", label: "My Suggestions" }]}
                        value={internal.mine ? ["mine"] : []}
                        onChange={(next) => {
                            const mine = next.includes("mine");
                            update({ mine, unseen: mine ? false : internal.unseen });
                        }}
                    />
                    <ToggleButtonGroup
                        options={[{ key: "unseen", label: "Unseen Only" }]}
                        value={internal.unseen ? ["unseen"] : []}
                        onChange={(next) => {
                            const unseen = next.includes("unseen");
                            update({ unseen, mine: unseen ? false : internal.mine });
                        }}
                    />
                </div>
                {/* Independent of `mine` (always the signed-in viewer) - a multiselect, since several
                    specific people at once is a real case unlike the single-choice fields above. */}
                <KeyedMultiSelectField
                    label="Submitted By"
                    placeholder="Search users..."
                    options={users.map((entry) => ({ key: entry.discordId, label: entry.displayname }))}
                    value={internal.byUsers}
                    onChange={(byUsers) => update({ byUsers })}
                />
                <ToggleButtonGroup
                    options={[
                        { key: "awaiting", label: "Awaiting Approval" },
                        { key: "only", label: "Only Approved" },
                        { key: "none", label: "Not Approved" }
                    ]}
                    value={internal.approvedFilter ? [internal.approvedFilter] : []}
                    onChange={(next) => {
                        const approvedFilter = pickExclusive(next, internal.approvedFilter);
                        update({ approvedFilter });
                    }}
                />
                {/* A bespoke group, not ToggleButtonGroup - that treats an option carrying an icon as
                    icon-only, wrong here where both icon and label need to stay visible. */}
                <ButtonGroup size="sm" className="flex-wrap self-start">
                    {REACTION_FILTER_OPTIONS.map(({ key, label, icon }) => {
                        const isSelected = internal.myReactions.includes(key);
                        return (
                            <Button
                                key={key}
                                variant={isSelected ? "solid" : "flat"}
                                color={isSelected ? "primary" : "default"}
                                startContent={<FontAwesomeIcon icon={icon} className="text-xs" />}
                                onPress={() =>
                                    update({
                                        myReactions: isSelected
                                            ? internal.myReactions.filter((entry) => entry !== key)
                                            : [...internal.myReactions, key]
                                    })
                                }
                            >
                                {label}
                            </Button>
                        );
                    })}
                </ButtonGroup>
                <Input label="Name" size="sm" value={internal.name} onValueChange={(name) => update({ name })} />
                <KeyedMultiSelectField
                    placeholder="Search traits..."
                    options={traits.map((trait) => ({ key: trait, label: trait }))}
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
                    <NumericFilterInput
                        label="Income"
                        value={internal.income}
                        onChange={(income) => update({ income })}
                    />
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
                <div className="border-t border-content3 pt-2 flex flex-col gap-2">
                    <div className="text-xs text-default-500">Design</div>
                    <KeyedMultiSelectField
                        placeholder="Search reward types..."
                        options={REWARD_TYPES.map((entry) => ({ key: entry.id, label: entry.label }))}
                        value={internal.rewardTypes}
                        onChange={(rewardTypes) => update({ rewardTypes: rewardTypes as RewardType[] })}
                    />
                    <KeyedMultiSelectField
                        placeholder="Search punishment..."
                        options={PUNISHMENT_TYPES.map((entry) => ({ key: entry.id, label: entry.label }))}
                        value={internal.punishment}
                        onChange={(punishment) => update({ punishment: punishment as PunishmentType[] })}
                    />
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                        <ToggleButtonGroup
                            options={abilityTypes.map((entry) => ({ key: entry, label: entry }))}
                            value={internal.abilityTypes}
                            onChange={(abilityTypes) => update({ abilityTypes })}
                        />
                        <BooleanToggle
                            trueLabel="Iconic"
                            falseLabel="Not Iconic"
                            value={internal.iconic}
                            onChange={(iconic) => update({ iconic })}
                        />
                    </div>
                </div>
            </DrawerBody>
            <DrawerFooter>
                <Button variant="flat" onPress={clearAll} isDisabled={!isSuggestionFilterActive(value)}>
                    Clear all
                </Button>
                <Button color="primary" onPress={onClose}>
                    Done
                </Button>
            </DrawerFooter>
        </>
    );
};

export default SuggestionFilterDrawer;
