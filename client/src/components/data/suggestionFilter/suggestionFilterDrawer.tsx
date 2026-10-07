import {
    Button,
    ButtonGroup,
    Divider,
    DrawerBody,
    DrawerFooter,
    DrawerHeader,
    Input,
    SharedSelection
} from "@heroui/react";
import { useMemo, useState } from "react";
import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import {
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
import { EASE_STANDARD, factionBgClasses, factionBorderClasses } from "../../../constants";
import { useGetSettingsQuery, useGetSuggestionsFeedQuery } from "../../../api";
import Permission from "common/models/permissions";
import { usePermission } from "../../../hooks/usePermission";
import { IRewardPunishmentOption } from "common/models/settings";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEyeSlash, faThumbsDown, faThumbsUp, faXmark, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import ThronesIcon from "../../thronesIcon";
import UserAvatar from "../../userAvatar";
import SearchableMultiSelect from "../searchableMultiSelect";
import { ToggleButtonGroup, BooleanToggle, NumericFilterInput } from "../filters";
import { NumericFilterValue, decodeNumericOperators, numericOperators } from "../filters/numeric";
import { EMPTY_SUGGESTION_FILTER, isSuggestionFilterActive, SuggestionFilterValue, SuggestionSegment } from "./types";

const EMPTY_OPTIONS: IRewardPunishmentOption[] = [];

const SEGMENT_SECTION_FOLD = { duration: 0.25, ease: EASE_STANDARD } as const;

// One chip per faction, in the order first picked - its types in words, or "All Cards" when it's whole
function segmentChips(segments: SuggestionSegment[]) {
    const byFaction = new Map<Faction, SuggestionSegment[]>();
    for (const segment of segments) {
        byFaction.set(segment.faction, [...(byFaction.get(segment.faction) ?? []), segment]);
    }
    return [...byFaction.entries()].map(([faction, picked]) => ({
        faction,
        label: picked.some((segment) => !segment.type)
            ? "All Cards"
            : picked.map((segment) => typeNames[segment.type!]).join(", ")
    }));
}

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
    tags: string[];
    iconic?: boolean;
    legacy?: boolean;
    archived: boolean;
    developed: boolean;
    segments: SuggestionSegment[];
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
        tags: value.tags ?? [],
        iconic: value.iconic,
        legacy: value.legacy,
        archived: value.archived === true,
        developed: value.developed === true,
        segments: value.segments ?? []
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
        tags: state.tags.length > 0 ? state.tags : undefined,
        iconic: state.iconic,
        legacy: state.legacy,
        archived: state.archived || undefined,
        developed: state.developed || undefined,
        segments: state.segments.length > 0 ? state.segments : undefined
    };
}

// Same search+chips pattern as cardFilterDrawer.tsx's MultiSelectField, generalised to id/label pairs
// so it also covers the tags list below (not just bare strings).
type KeyedOption = { key: string; label: string };
type KeyedMultiSelectFieldProps = {
    placeholder: string;
    options: KeyedOption[];
    value: string[];
    onChange: (value: string[]) => void;
    /** Tags are free-text phrases with no natural casing of their own - true for that field only. */
    uppercase?: boolean;
};

function KeyedMultiSelectField({ placeholder, options, value, onChange, uppercase }: KeyedMultiSelectFieldProps) {
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

    return (
        <SearchableMultiSelect
            size="md"
            radius="sm"
            placeholder={placeholder}
            items={items}
            getKey={(item) => item.key}
            renderItem={(item) => <span className={classNames(uppercase && "uppercase")}>{item.label}</span>}
            getChipLabel={(item) => <span className={classNames(uppercase && "uppercase")}>{item.label}</span>}
            selectedKeys={value}
            onSelectionChange={handleSelectionChange}
            search={search}
            onSearchChange={setSearch}
            hasMore={false}
            onLoadMore={() => undefined}
        />
    );
}

// Same shape as KeyedMultiSelectField, but for discordId/displayname pairs, so each row/chip can carry
// the submitter's avatar (fetched by UserAvatar itself, keyed off discordId).
type UserOption = { discordId: string; displayname: string };
type UserMultiSelectFieldProps = {
    placeholder: string;
    options: UserOption[];
    value: string[];
    onChange: (value: string[]) => void;
};

function UserMultiSelectField({ placeholder, options, value, onChange }: UserMultiSelectFieldProps) {
    const [search, setSearch] = useState("");

    const items = useMemo(() => {
        const term = search.trim().toLowerCase();
        const filtered = term ? options.filter((option) => option.displayname.toLowerCase().includes(term)) : options;
        const missingSelected = options.filter(
            (option) => value.includes(option.discordId) && !filtered.some((f) => f.discordId === option.discordId)
        );
        return [...missingSelected, ...filtered];
    }, [options, search, value]);

    const handleSelectionChange = (keys: SharedSelection) => {
        onChange(keys === "all" ? items.map((item) => item.discordId) : ([...keys] as string[]));
    };

    return (
        <SearchableMultiSelect
            size="md"
            radius="sm"
            placeholder={placeholder}
            items={items}
            getKey={(item) => item.discordId}
            renderItem={(item) => (
                <div className="flex items-center gap-2 w-full min-w-0">
                    <UserAvatar discordId={item.discordId} size="sm" />
                    <span className="truncate text-small">{item.displayname}</span>
                </div>
            )}
            getChipLabel={(item) => (
                <span className="flex items-center gap-1.5">
                    <UserAvatar discordId={item.discordId} className="!size-4" />
                    {item.displayname}
                </span>
            )}
            selectedKeys={value}
            onSelectionChange={handleSelectionChange}
            search={search}
            onSearchChange={setSearch}
            hasMore={false}
            onLoadMore={() => undefined}
        />
    );
}

// A ToggleButtonGroup toggles independently per key - resolving the picked key here (rather than
// teaching it a new "exclusive" mode) gives a row radio-like behaviour instead.
function pickExclusive<T extends string>(next: T[], previous?: T): T | undefined {
    return next.find((key) => key !== previous);
}

type SuggestionFilterDrawerProps = {
    value: SuggestionFilterValue;
    onChange: (value: SuggestionFilterValue) => void;
    traits: string[];
    users: { discordId: string; displayname: string }[];
    isFactionFixed?: boolean;
    onClose: () => void;
};

const SuggestionFilterDrawer = ({
    value,
    onChange,
    traits,
    users,
    isFactionFixed,
    onClose
}: SuggestionFilterDrawerProps) => {
    const [internal, setInternal] = useState<InternalState>(() => decode(value));
    const canManageArchive = usePermission(Permission.MANAGE_SUGGESTIONS_ARCHIVE);
    const { data: feed } = useGetSuggestionsFeedQuery(undefined, { skip: !canManageArchive });
    const hasPossiblyDeveloped = (feed?.stats.possiblyDeveloped ?? 0) > 0;
    const { data: suggestionSettings } = useGetSettingsQuery("suggestions");
    const rewardTypeOptions = suggestionSettings?.rewardTypes ?? EMPTY_OPTIONS;
    const punishmentTypeOptions = suggestionSettings?.punishmentTypes ?? EMPTY_OPTIONS;
    // Every tag defined across either registry - the only way left to reach reward/punishment ids.
    const tagOptions = useMemo(
        () => [...new Set([...rewardTypeOptions, ...punishmentTypeOptions].flatMap((option) => option.tags))],
        [rewardTypeOptions, punishmentTypeOptions]
    );

    const update = (patch: Partial<InternalState>) => {
        const next = { ...internal, ...patch };
        setInternal(next);
        onChange(compose(next));
    };

    const clearAll = () => {
        setInternal(decode(EMPTY_SUGGESTION_FILTER));
        onChange(EMPTY_SUGGESTION_FILTER);
    };

    // mine/unseen are two "which suggestions" angles on the same underlying set - exclusive of each
    // other, so they share one group (pickExclusive) rather than toggling independently.
    const suggestionScope: ("mine" | "unseen")[] = internal.mine ? ["mine"] : internal.unseen ? ["unseen"] : [];

    return (
        <>
            <DrawerHeader>Filter Suggestions</DrawerHeader>
            <DrawerBody className="gap-2 py-2">
                {/* A Suggestion Statistics selection - pairs the faction and type pickers below can't express, so
                    they get their own section, and picking either below replaces them. It folds away once its last
                    chip goes; the negative margin cancels the body's gap, so a folded section leaves no trace. */}
                <AnimatePresence initial={false}>
                    {internal.segments.length > 0 && (
                        <motion.div
                            key="segments"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={SEGMENT_SECTION_FOLD}
                            className="-mb-2 overflow-hidden"
                        >
                            <div className="flex flex-col gap-2 pb-4">
                                <div className="text-xs font-semibold text-default-500">Statistics Segment Filter</div>
                                <div className="flex flex-wrap gap-1">
                                    {/* CardBadge's look (faction tint and border), with the faction's icon in
                                        place of a card's type */}
                                    {segmentChips(internal.segments).map(({ faction, label }) => (
                                        <span
                                            key={faction}
                                            className={classNames(
                                                "inline-flex items-center gap-1 align-middle pl-2 pr-1 py-0.5 rounded-full border text-xs font-medium min-w-0",
                                                factionBgClasses[faction],
                                                factionBorderClasses[faction]
                                            )}
                                        >
                                            <ThronesIcon name={faction} className="shrink-0" />
                                            <span className="truncate">{label}</span>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    update({
                                                        segments: internal.segments.filter(
                                                            (segment) => segment.faction !== faction
                                                        )
                                                    })
                                                }
                                                aria-label={`Remove ${factionNames[faction]}`}
                                                className="shrink-0 ml-0.5 cursor-pointer text-foreground/50 hover:text-danger"
                                            >
                                                <FontAwesomeIcon icon={faXmark} className="text-[0.6rem]" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <Divider className="mt-2" />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div className="text-xs font-semibold text-default-500">Suggestion Filters</div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <ToggleButtonGroup
                        options={[
                            { key: "mine", label: "My Suggestions" },
                            { key: "unseen", label: "Unseen Only" }
                        ]}
                        value={suggestionScope}
                        onChange={(next) => {
                            const picked = pickExclusive(next, suggestionScope[0]);
                            update({ mine: picked === "mine", unseen: picked === "unseen" });
                        }}
                    />
                    <BooleanToggle
                        trueLabel="Iconic"
                        falseLabel="Not Iconic"
                        value={internal.iconic}
                        onChange={(iconic) => update({ iconic })}
                    />
                    <BooleanToggle
                        trueLabel="Legacy"
                        falseLabel="Not Legacy"
                        value={internal.legacy}
                        onChange={(legacy) => update({ legacy })}
                    />
                    {canManageArchive && (
                        <ToggleButtonGroup
                            options={[{ key: "archived", label: "Archived" }]}
                            value={internal.archived ? ["archived"] : []}
                            onChange={(next) => update({ archived: next.includes("archived") })}
                        />
                    )}
                    {canManageArchive && (hasPossiblyDeveloped || internal.developed) && (
                        <ToggleButtonGroup
                            options={[{ key: "developed", label: "May Be Developed" }]}
                            value={internal.developed ? ["developed"] : []}
                            onChange={(next) => update({ developed: next.includes("developed") })}
                        />
                    )}
                </div>
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
                <KeyedMultiSelectField
                    placeholder="Search tags..."
                    options={tagOptions.map((tag) => ({ key: tag, label: tag }))}
                    value={internal.tags}
                    onChange={(tags) => update({ tags })}
                    uppercase
                />
                <UserMultiSelectField
                    placeholder="Search users..."
                    options={users}
                    value={internal.byUsers}
                    onChange={(byUsers) => update({ byUsers })}
                />

                <div className="border-t border-content3 pt-2 flex flex-col gap-2">
                    <div className="text-xs font-semibold text-default-500">Card Filters</div>
                    <Input label="Name" size="sm" value={internal.name} onValueChange={(name) => update({ name })} />
                    <KeyedMultiSelectField
                        placeholder="Search traits..."
                        options={traits.map((trait) => ({ key: trait, label: trait }))}
                        value={internal.traits}
                        onChange={(traits) => update({ traits })}
                    />
                    {!isFactionFixed && (
                        <ToggleButtonGroup
                            options={factions.map((faction) => ({
                                key: faction,
                                label: factionNames[faction],
                                icon: <ThronesIcon name={faction} />
                            }))}
                            value={internal.factions}
                            onChange={(factions) => update({ factions, segments: [] })}
                        />
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                        <ToggleButtonGroup
                            options={types.map((type) => ({
                                key: type,
                                label: typeNames[type],
                                icon: <ThronesIcon name={type} />
                            }))}
                            value={internal.types}
                            onChange={(types) => update({ types, segments: [] })}
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
                        <NumericFilterInput
                            label="Claim"
                            value={internal.claim}
                            onChange={(claim) => update({ claim })}
                        />
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
