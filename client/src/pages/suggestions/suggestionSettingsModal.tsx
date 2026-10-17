import { FormEvent, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { omit } from "lodash-es";
import {
    addToast,
    Button,
    Divider,
    Form,
    Input,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Select,
    SelectItem,
    Skeleton,
    Switch,
    Tab,
    Tabs
} from "@heroui/react";
import Modal from "../../components/modal";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faPencil, faPlus, faTrash, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { isDirty } from "common/utils";
import { keywordNames } from "common/designGuidelines/deriveFields";
import {
    changedTagIds,
    findTagKindClash,
    optionTags,
    tagKindLabels,
    TagKind
} from "common/designGuidelines/suggestionTags";
import {
    DEFAULT_NEUTRAL_WEIGHT,
    DEFAULT_TREND_RANGE,
    IRewardDownsideOption,
    ISuggestionsSettings,
    TrendRange
} from "common/models/settings";
import { isTrendRange, TREND_RANGES } from "./trendRange";
import { RewardDownsideOption } from "common/models/schemas";
import { useGetSettingsQuery, useUpdateSettingsMutation } from "../../api";
import Permission from "common/models/permissions";
import { usePermission } from "../../hooks/usePermission";
import { useFormValidation } from "../../hooks/useFormValidation";
import FormValidationSummary from "../../components/formValidationSummary";
import KeyedMultiSelectField from "../../components/data/keyedMultiSelectField";
import TagChip from "../../components/designGuidelines/tagChip";
import { showApiErrorToast } from "../../api/errors";
import { containsAllWords } from "../../utils";
import { TouchTooltip } from "../../components/touchTooltip";
import { EASE_STANDARD } from "../../constants";
import { scrollableTabs } from "../../hooks/useSelectedTabInView";
import useDebounce from "../../hooks/useDebounce";

// The row's own presence in the list (insertion/removal) - separate from, and deliberately not as fast
// as, the edit/view crossfade below.
const ROW_TRANSITION = { duration: 0.2, ease: EASE_STANDARD } as const;

const SEARCH_DEBOUNCE_MS = 150;

// The GET response annotates each option with how many suggestions currently use it, purely for this
// modal's own delete-guard - stripped again in stripUsage before every PATCH, never persisted back.
type OptionWithUsage = IRewardDownsideOption & { usageCount: number };
type SettingsResponse = Omit<ISuggestionsSettings, "rewardOptions" | "downsideOptions"> & {
    rewardOptions: OptionWithUsage[];
    downsideOptions: OptionWithUsage[];
};
type Kind = "rewardOptions" | "downsideOptions";
type Draft = IRewardDownsideOption;

// The modal's single local edit session - everything a footer Save writes in one PATCH.
type SettingsDraft = {
    minimumLikesThreshold: number;
    neutralWeight: number;
    defaultTrendRange: TrendRange;
    rewardOptions: OptionWithUsage[];
    downsideOptions: OptionWithUsage[];
};

const ASPECT_KIND: Record<Kind, TagKind> = { rewardOptions: "aspect", downsideOptions: "drawback" };

// Pick from the tags in use, or type a new one and press enter - always lowercase, so "Tempo" and "tempo" are one tag
function TagsField({
    label,
    values,
    suggestions,
    kind,
    onChange
}: {
    label: string;
    values: string[];
    suggestions: string[];
    kind: TagKind;
    onChange: (values: string[]) => void;
}) {
    const options = useMemo(
        () => [...new Set([...suggestions, ...values])].map((tag) => ({ key: tag, label: tag })),
        [suggestions, values]
    );
    return (
        <KeyedMultiSelectField
            label={label}
            placeholder="Pick one, or type a new one and press enter"
            options={options}
            value={values}
            onChange={onChange}
            uppercase
            getKind={() => kind}
            onCreate={(text) => {
                const tag = text.trim().toLowerCase();
                if (tag && !values.includes(tag)) {
                    onChange([...values, tag]);
                }
            }}
        />
    );
}

function stripUsage(options: OptionWithUsage[]): IRewardDownsideOption[] {
    return options.map((option) => omit(option, "usageCount"));
}

/** Reward/downside option settings, as a modal rather than its own page. One edit session: every row
 *  action and scalar field mutates a single local draft until the footer Save. */
export default function SuggestionSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    // Subscribed from the moment the page mounts this (closed) modal rather than from when it opens, so the settings
    // are already cached by the time anyone does. Its tags keep that cache current - a save, or any change to a
    // suggestion (which moves usage counts), refetches it in the background. Only an editor subscribes: nobody else
    // can open the modal, and the usage counts are the edit permission's alone.
    const canEditSettings = usePermission(Permission.EDIT_SETTINGS_SUGGESTIONS);
    const {
        data: rawData,
        isFetching,
        isError,
        refetch
    } = useGetSettingsQuery({ type: "suggestions", includeUsage: true }, { skip: !canEditSettings });
    const data = rawData as SettingsResponse | undefined;
    const [updateSettings, { isLoading: isSaving }] = useUpdateSettingsMutation();

    const [tab, setTab] = useState<Kind>("rewardOptions");
    // Downsides is the tab most sessions never open - deferring its list's mount until it's actually
    // been viewed once means a reward-only session never pays for building it.
    const [hasViewedDownsides, setHasViewedDownsides] = useState(false);
    useEffect(() => {
        if (tab === "downsideOptions") {
            setHasViewedDownsides(true);
        }
    }, [tab]);

    // Seeded once per open, so a background refetch mid-edit can't clobber it - from the cache, unless a refetch is
    // already under way. Reopening straight after a save is that case: the save invalidates the cache, whose refetch
    // starts the moment the save lands, so the old values are never mistaken for the settled ones. A layout effect,
    // so an open with the settings to hand paints the fields straight away rather than a frame of skeleton first.
    // `original` is the frozen snapshot dirty comparisons run against.
    const [draft, setDraft] = useState<SettingsDraft | undefined>(undefined);
    const originalRef = useRef<SettingsDraft | undefined>(undefined);
    useLayoutEffect(() => {
        if (isOpen && data && !draft && !isFetching) {
            const snapshot: SettingsDraft = {
                minimumLikesThreshold: data.minimumLikesThreshold,
                neutralWeight: data.neutralWeight ?? DEFAULT_NEUTRAL_WEIGHT,
                defaultTrendRange: isTrendRange(data.defaultTrendRange) ? data.defaultTrendRange : DEFAULT_TREND_RANGE,
                rewardOptions: data.rewardOptions,
                downsideOptions: data.downsideOptions
            };
            setDraft(snapshot);
            originalRef.current = snapshot;
        }
    }, [isOpen, data, draft, isFetching]);
    useEffect(() => {
        if (!isOpen) {
            setDraft(undefined);
            originalRef.current = undefined;
            setTab("rewardOptions");
            setHasViewedDownsides(false);
        }
    }, [isOpen]);

    // Each field offers what the draft already uses, so a new tag is on offer to the next option before saving
    const vocabulary = useMemo(() => {
        const unique = (values: string[]) => [...new Set(values)].sort();
        const rewards = draft?.rewardOptions ?? [];
        const downsides = draft?.downsideOptions ?? [];
        return {
            rewardOptions: { aspects: unique(rewards.flatMap((option) => option.aspects)) },
            downsideOptions: { aspects: unique(downsides.flatMap((option) => option.aspects)) },
            archetypes: unique([...rewards, ...downsides].flatMap((option) => option.archetypes))
        };
    }, [draft?.rewardOptions, draft?.downsideOptions]);

    const updateOptions = (kind: Kind, updater: (options: OptionWithUsage[]) => OptionWithUsage[]) => {
        setDraft((previous) => previous && { ...previous, [kind]: updater(previous[kind]) });
    };

    const onToggleEnabled = useCallback((kind: Kind, id: string) => {
        updateOptions(kind, (options) =>
            options.map((entry) => (entry.id === id ? { ...entry, enabled: !entry.enabled } : entry))
        );
    }, []);

    const onDeleteOption = useCallback((kind: Kind, id: string) => {
        updateOptions(kind, (options) => options.filter((entry) => entry.id !== id));
    }, []);

    const onUpsertOption = useCallback((kind: Kind, option: IRewardDownsideOption) => {
        updateOptions(kind, (options) =>
            options.some((entry) => entry.id === option.id)
                ? options.map((entry) => (entry.id === option.id ? { ...option, usageCount: entry.usageCount } : entry))
                : [...options, { ...option, usageCount: 0 }]
        );
    }, []);

    // Whole-array comparisons (add/edit/delete/reorder all show up as a difference) - same helper the
    // per-row dot and the footer Save button already use, just scoped to one kind's array at a time.
    const rewardOptionsDirty = isDirty(originalRef.current?.rewardOptions, draft?.rewardOptions);
    const downsideOptionsDirty = isDirty(originalRef.current?.downsideOptions, draft?.downsideOptions);

    // Mirrors the server's trigger for resyncing suggestion tags, as a heads-up that the save will be slower
    const willResyncTags =
        !!originalRef.current &&
        !!draft &&
        (changedTagIds(originalRef.current.rewardOptions, draft.rewardOptions).length > 0 ||
            changedTagIds(originalRef.current.downsideOptions, draft.downsideOptions).length > 0);

    const onSave = async () => {
        if (!draft) {
            return;
        }
        // The server refuses this too - caught here to skip the round trip
        const clash = findTagKindClash(draft.rewardOptions, draft.downsideOptions);
        if (clash) {
            addToast({
                title: "Can't save settings",
                color: "danger",
                description: `"${clash.tag}" is used as both ${clash.kinds.map((kind) => tagKindLabels[kind].toLowerCase()).join(" and ")}`
            });
            return;
        }
        try {
            await updateSettings({
                type: "suggestions",
                data: {
                    minimumLikesThreshold: draft.minimumLikesThreshold,
                    neutralWeight: draft.neutralWeight,
                    defaultTrendRange: draft.defaultTrendRange,
                    rewardOptions: stripUsage(draft.rewardOptions),
                    downsideOptions: stripUsage(draft.downsideOptions)
                }
            }).unwrap();
            originalRef.current = draft;
            addToast({ title: "Saved", color: "success", description: "Suggestion settings updated" });
            onClose();
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to save settings" });
        }
    };

    return (
        <Modal isOpen={isOpen} size="5xl" onOpenChange={(open) => !open && onClose()}>
            <ModalContent>
                <ModalHeader>Suggestion Settings</ModalHeader>
                <ModalBody className="gap-6 pb-6">
                    {isError && !draft ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                            <FontAwesomeIcon icon={faTriangleExclamation} className="text-4xl text-warning" />
                            <div className="text-sm text-foreground/70">
                                Something went wrong loading settings. Please try again shortly.
                            </div>
                            <Button variant="flat" color="primary" onPress={() => refetch()}>
                                Retry
                            </Button>
                        </div>
                    ) : !draft ? (
                        <SettingsSkeleton />
                    ) : (
                        <>
                            <div className="flex flex-col gap-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                                    <Input
                                        type="number"
                                        label="Minimum likes threshold"
                                        description="Likes needed to await approval"
                                        min={1}
                                        value={String(draft.minimumLikesThreshold ?? "")}
                                        onValueChange={(value) =>
                                            setDraft(
                                                (previous) =>
                                                    previous && {
                                                        ...previous,
                                                        minimumLikesThreshold: value ? Number(value) : 0
                                                    }
                                            )
                                        }
                                    />
                                    <Input
                                        type="number"
                                        label="Neutral weight"
                                        description="Neutral's target size in Suggestion Spread, as a multiple of the average faction"
                                        min={1}
                                        max={10}
                                        step={0.5}
                                        value={String(draft.neutralWeight ?? "")}
                                        onValueChange={(value) =>
                                            setDraft(
                                                (previous) =>
                                                    previous && {
                                                        ...previous,
                                                        neutralWeight: value ? Number(value) : 0
                                                    }
                                            )
                                        }
                                    />
                                    <Select
                                        aria-label="Default chart range"
                                        label="Default chart range"
                                        description="The range Suggestion Statistics opens on"
                                        disallowEmptySelection
                                        selectedKeys={[draft.defaultTrendRange]}
                                        onSelectionChange={(keys) => {
                                            const picked = String([...keys][0]);
                                            if (isTrendRange(picked)) {
                                                setDraft(
                                                    (previous) => previous && { ...previous, defaultTrendRange: picked }
                                                );
                                            }
                                        }}
                                    >
                                        {TREND_RANGES.map((option) => (
                                            <SelectItem key={option.key}>{option.label}</SelectItem>
                                        ))}
                                    </Select>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <Tabs
                                    classNames={{ ...scrollableTabs, panel: "p-0" }}
                                    selectedKey={tab}
                                    onSelectionChange={(key) => setTab(key as Kind)}
                                    aria-label="Reward and downside options"
                                    variant="underlined"
                                    color="primary"
                                    size="lg"
                                    destroyInactiveTabPanel={false}
                                >
                                    <Tab
                                        key="rewardOptions"
                                        title={<TabTitle label="Rewards" isDirty={rewardOptionsDirty} />}
                                    >
                                        <RewardDownsideList
                                            kind="rewardOptions"
                                            kindLabel="Reward Type"
                                            aspectSuggestions={vocabulary.rewardOptions.aspects}
                                            archetypeSuggestions={vocabulary.archetypes}
                                            options={draft.rewardOptions}
                                            originalOptions={originalRef.current?.rewardOptions ?? []}
                                            isOpen={isOpen}
                                            isActivePage={tab === "rewardOptions"}
                                            onUpsertOption={(option) => onUpsertOption("rewardOptions", option)}
                                            onToggleEnabled={(id) => onToggleEnabled("rewardOptions", id)}
                                            onDelete={(id) => onDeleteOption("rewardOptions", id)}
                                        />
                                    </Tab>
                                    <Tab
                                        key="downsideOptions"
                                        title={<TabTitle label="Downsides" isDirty={downsideOptionsDirty} />}
                                    >
                                        {hasViewedDownsides && (
                                            <RewardDownsideList
                                                kind="downsideOptions"
                                                kindLabel="Downside Type"
                                                aspectSuggestions={vocabulary.downsideOptions.aspects}
                                                archetypeSuggestions={vocabulary.archetypes}
                                                options={draft.downsideOptions}
                                                originalOptions={originalRef.current?.downsideOptions ?? []}
                                                isOpen={isOpen}
                                                isActivePage={tab === "downsideOptions"}
                                                onUpsertOption={(option) => onUpsertOption("downsideOptions", option)}
                                                onToggleEnabled={(id) => onToggleEnabled("downsideOptions", id)}
                                                onDelete={(id) => onDeleteOption("downsideOptions", id)}
                                            />
                                        )}
                                    </Tab>
                                </Tabs>
                            </div>
                        </>
                    )}
                </ModalBody>
                <ModalFooter>
                    {willResyncTags && (
                        <div className="flex items-center gap-1.5 mr-auto text-xs text-warning">
                            <FontAwesomeIcon icon={faTriangleExclamation} />
                            Saving may take longer than usual - tags must be recomputed on suggestions.
                        </div>
                    )}
                    <Button onPress={onClose}>Close</Button>
                    <Button color="primary" isDisabled={isSaving} onPress={onSave}>
                        Save
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

function TabTitle({ label, isDirty }: { label: string; isDirty: boolean }) {
    return (
        <span className="flex items-center gap-1.5">
            {label}
            {isDirty && (
                <span className="size-1.5 rounded-full bg-warning shrink-0" aria-label="Unsaved changes" role="img" />
            )}
        </span>
    );
}

// Shaped like what it stands in for: the four fields with their descriptions, the tabs, and a reward list's search,
// add button and rows
function SettingsSkeleton() {
    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="flex flex-col gap-1.5">
                        <Skeleton className="h-14 w-full rounded-medium" />
                        <Skeleton className="h-3 w-2/3 rounded-full" />
                    </div>
                ))}
            </div>
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-6 h-12">
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <div className="flex flex-col gap-3 pt-3">
                    <div className="flex gap-2">
                        <Skeleton className="h-8 flex-1 rounded-small" />
                        <Skeleton className="h-8 w-36 rounded-small" />
                    </div>
                    <div className="flex flex-col divide-y divide-divider rounded-lg border border-content3 px-3">
                        {Array.from({ length: 5 }).map((_, index) => (
                            <div key={index} className="flex items-center gap-3 py-2.5">
                                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                                    <Skeleton className="h-4 w-40 max-w-full rounded-full" />
                                    <Skeleton className="h-3 w-2/3 rounded-full" />
                                </div>
                                <Skeleton className="h-5 w-10 rounded-full shrink-0" />
                                <Skeleton className="size-8 rounded-small shrink-0" />
                                <Skeleton className="size-8 rounded-small shrink-0" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function RewardDownsideList({
    kind,
    kindLabel,
    aspectSuggestions,
    archetypeSuggestions,
    options,
    originalOptions,
    isOpen,
    isActivePage,
    onUpsertOption,
    onToggleEnabled,
    onDelete
}: {
    kind: Kind;
    kindLabel: string;
    aspectSuggestions: string[];
    archetypeSuggestions: string[];
    options: OptionWithUsage[];
    originalOptions: OptionWithUsage[];
    isOpen: boolean;
    isActivePage: boolean;
    onUpsertOption: (option: IRewardDownsideOption) => void;
    onToggleEnabled: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const [search, setSearch] = useState("");
    const { value: debouncedSearch } = useDebounce(search, SEARCH_DEBOUNCE_MS);
    const [editingId, setEditingId] = useState<string>();
    const [pendingNew, setPendingNew] = useState<OptionWithUsage>();

    const isAnyEditing = editingId !== undefined;

    // Closing the modal, or navigating away to the other tab, shouldn't leave a stale open editor, or an
    // abandoned unsaved draft, waiting for the next time this list is shown again.
    useEffect(() => {
        if (!isOpen || !isActivePage) {
            setSearch("");
            setEditingId(undefined);
            setPendingNew(undefined);
        }
    }, [isOpen, isActivePage]);

    // The row being edited must never be filtered out from under the editor. Filtering runs off the
    // debounced value so a keystroke doesn't force a recompute (and reflow) per character.
    const filtered = useMemo(
        () =>
            options.filter(
                (option) =>
                    option.id === editingId ||
                    containsAllWords(
                        [option.label, option.description, ...optionTags(option), ...option.keywords].join(" "),
                        debouncedSearch
                    )
            ),
        [options, debouncedSearch, editingId]
    );

    // The unsaved new row is always shown regardless of the search text - it hasn't earned a place in
    // the filtered list yet, since it doesn't have a label or tags to match against.
    const rows = pendingNew ? [pendingNew, ...filtered] : filtered;

    // Read through refs so the id-keyed callbacks below stay referentially stable without needing
    // `options`/`originalOptions` as dependencies.
    const optionsRef = useRef(options);
    optionsRef.current = options;
    const originalOptionsRef = useRef(originalOptions);
    originalOptionsRef.current = originalOptions;

    const startEdit = useCallback((id: string) => {
        // Switching to another row's editor abandons an unsaved new draft - it was never a real option
        setPendingNew((previous) => (previous && previous.id !== id ? undefined : previous));
        setEditingId(id);
    }, []);

    const onAdd = () => {
        const draft: OptionWithUsage = {
            id: crypto.randomUUID(),
            label: "",
            description: "",
            aspects: [],
            archetypes: [],
            keywords: [],
            enabled: true,
            usageCount: 0
        };
        setPendingNew(draft);
        setEditingId(draft.id);
    };

    const collapseRow = useCallback((id: string) => {
        setPendingNew((previous) => (previous?.id === id ? undefined : previous));
        setEditingId((previous) => (previous === id ? undefined : previous));
    }, []);

    const submitRow = useCallback(
        (option: IRewardDownsideOption) => {
            onUpsertOption(option);
            setEditingId(undefined);
            setPendingNew(undefined);
        },
        [onUpsertOption]
    );

    // Shared guard: a row's action buttons can be pressed mid-animation right as it's removed elsewhere
    // (eg. someone else's edit lands via a live refetch) - stale ids just fall through as a no-op.
    const guardExisting = useCallback((id: string, fn: (id: string) => void) => {
        if (optionsRef.current.some((entry) => entry.id === id)) {
            fn(id);
        }
    }, []);

    const toggleEnabledRow = useCallback(
        (id: string) => guardExisting(id, onToggleEnabled),
        [guardExisting, onToggleEnabled]
    );

    const deleteRow = useCallback((id: string) => guardExisting(id, onDelete), [guardExisting, onDelete]);

    const isRowDirty = useCallback((option: OptionWithUsage) => {
        const original = originalOptionsRef.current.find((entry) => entry.id === option.id);
        return !original || isDirty(original, option);
    }, []);

    return (
        <div className="flex flex-col gap-3 pt-3">
            <div className="flex gap-2">
                <Input
                    size="sm"
                    className="flex-1"
                    placeholder={`Search ${kindLabel.toLowerCase()}s by name, tag or keyword…`}
                    value={search}
                    onValueChange={setSearch}
                    startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="text-foreground/40" />}
                />
                <Button
                    size="sm"
                    variant="flat"
                    color="primary"
                    className="shrink-0"
                    startContent={<FontAwesomeIcon icon={faPlus} />}
                    isDisabled={!!pendingNew}
                    onPress={onAdd}
                >
                    Add {kindLabel}
                </Button>
            </div>
            <div className="flex flex-col rounded-lg border border-content3 px-3">
                {rows.length === 0 && (
                    <div className="py-6 text-center text-xs text-foreground/50">
                        No {kindLabel.toLowerCase()}s {options.length === 0 ? "yet" : "match that search"}
                    </div>
                )}
                <AnimatePresence initial={false} mode="popLayout">
                    {rows.flatMap((option, index) => {
                        const elements = [];
                        if (index > 0) {
                            elements.push(
                                <motion.div
                                    key={`divider-${option.id}`}
                                    layout
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={ROW_TRANSITION}
                                >
                                    <Divider />
                                </motion.div>
                            );
                        }
                        elements.push(
                            <OptionRow
                                key={option.id}
                                option={option}
                                isDirty={isRowDirty(option)}
                                isEditing={editingId === option.id}
                                isOtherEditing={isAnyEditing && editingId !== option.id}
                                isNew={pendingNew?.id === option.id}
                                kind={kind}
                                aspectSuggestions={aspectSuggestions}
                                archetypeSuggestions={archetypeSuggestions}
                                onEdit={startEdit}
                                onCollapse={collapseRow}
                                onSubmit={submitRow}
                                onToggleEnabled={toggleEnabledRow}
                                onDelete={deleteRow}
                            />
                        );
                        return elements;
                    })}
                </AnimatePresence>
            </div>
        </div>
    );
}

const OptionRow = memo(function OptionRow({
    option,
    isDirty,
    isEditing,
    isOtherEditing,
    isNew,
    kind,
    aspectSuggestions,
    archetypeSuggestions,
    onEdit,
    onCollapse,
    onSubmit,
    onToggleEnabled,
    onDelete
}: {
    option: OptionWithUsage;
    isDirty: boolean;
    isEditing: boolean;
    isOtherEditing: boolean;
    isNew: boolean;
    kind: Kind;
    aspectSuggestions: string[];
    archetypeSuggestions: string[];
    onEdit: (id: string) => void;
    onCollapse: (id: string) => void;
    onSubmit: (option: IRewardDownsideOption) => void;
    onToggleEnabled: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const [draft, setDraft] = useState<Draft>(() => omit(option, "usageCount"));
    const { errors, validate, clearErrors } = useFormValidation(RewardDownsideOption.Draft);

    // Latches true the first time this row opens and never resets, so idle rows never pay for the editor -
    // once opened, it stays mounted so the shrink/grow fold below has something to animate.
    const [hasBeenOpened, setHasBeenOpened] = useState(isEditing);
    useEffect(() => {
        if (isEditing) {
            setHasBeenOpened(true);
        }
    }, [isEditing]);

    // Only resets on the rising edge of isEditing - a change made elsewhere shouldn't reset an in-progress
    // draft. Read through a ref so the effect doesn't need `option` as a dependency.
    const optionRef = useRef(option);
    optionRef.current = option;
    // Bumped on every rising edge and used to key RowEditor below, forcing a genuine remount of the form
    // internals - react-aria's per-field validity otherwise survives a Cancel even after clearErrors().
    const [editSession, setEditSession] = useState(0);
    useEffect(() => {
        if (isEditing) {
            setDraft(omit(optionRef.current, "usageCount"));
            clearErrors();
            setEditSession((session) => session + 1);
        }
    }, [isEditing, clearErrors]);

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
        setDraft((previous) => ({ ...previous, [key]: value }));

    const doSubmit = () => {
        const body: IRewardDownsideOption = {
            id: draft.id,
            label: draft.label.trim(),
            description: draft.description.trim(),
            aspects: draft.aspects,
            archetypes: draft.archetypes,
            keywords: draft.keywords,
            requiresLoyalty: draft.requiresLoyalty || undefined,
            enabled: draft.enabled
        };
        if (!validate(body)) {
            return;
        }
        onSubmit(body);
    };

    const FORM_ID = `reward-downside-form-${option.id}`;

    return (
        <motion.div
            layout="position"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ layout: ROW_TRANSITION, opacity: ROW_TRANSITION }}
            className={classNames(
                "rounded-lg border border-transparent transition-[padding,margin,border-color] duration-[250ms] ease-[cubic-bezier(0.65,0,0.35,1)]",
                isEditing ? "my-2 border-primary/40 px-1.5 py-3.5" : "py-2.5"
            )}
        >
            <div
                className={classNames(
                    "grid transition-[grid-template-rows,opacity] duration-[250ms] ease-[cubic-bezier(0.65,0,0.35,1)]",
                    isEditing ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
                )}
            >
                <div className="min-h-0 overflow-hidden">
                    <RowSummary
                        option={option}
                        kind={kind}
                        isDirty={isDirty}
                        isOtherEditing={isOtherEditing}
                        onEdit={() => onEdit(option.id)}
                        onToggleEnabled={() => onToggleEnabled(option.id)}
                        onDelete={() => onDelete(option.id)}
                    />
                </div>
            </div>
            <div
                className={classNames(
                    "grid transition-[grid-template-rows,opacity] duration-[250ms] ease-[cubic-bezier(0.65,0,0.35,1)]",
                    isEditing ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
            >
                <div className="min-h-0">
                    {hasBeenOpened && (
                        <RowEditor
                            key={editSession}
                            draft={draft}
                            set={set}
                            errors={errors}
                            formId={FORM_ID}
                            isNew={isNew}
                            kind={kind}
                            aspectSuggestions={aspectSuggestions}
                            archetypeSuggestions={archetypeSuggestions}
                            onCollapse={() => onCollapse(option.id)}
                            onSubmit={(e) => {
                                e.preventDefault();
                                doSubmit();
                            }}
                        />
                    )}
                </div>
            </div>
        </motion.div>
    );
});

function RowSummary({
    option,
    kind,
    isDirty,
    isOtherEditing,
    onEdit,
    onToggleEnabled,
    onDelete
}: {
    option: OptionWithUsage;
    kind: Kind;
    isDirty: boolean;
    isOtherEditing: boolean;
    onEdit: () => void;
    onToggleEnabled: () => void;
    onDelete: () => void;
}) {
    const label = (
        <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm font-medium truncate">
                {option.label || <span className="italic text-foreground/40">Untitled</span>}
                {isDirty && (
                    <span
                        className="size-1.5 rounded-full bg-warning shrink-0"
                        aria-label="Unsaved changes"
                        role="img"
                    />
                )}
            </div>
            {option.description && <div className="text-xs text-foreground/50 truncate">{option.description}</div>}
        </div>
    );

    const aspectKind = ASPECT_KIND[kind];
    const chips = [
        ...option.archetypes.map((tag) => <TagChip key={`archetype-${tag}`} tag={tag} kind="archetype" />),
        ...option.aspects.map((tag) => <TagChip key={`aspect-${tag}`} tag={tag} kind={aspectKind} />),
        ...option.keywords.map((keyword) => <TagChip key={`keyword-${keyword}`} tag={keyword} />),
        ...(option.requiresLoyalty ? [<TagChip key="loyalty" tag="loyalty check" />] : [])
    ];
    const tags = chips.length > 0 && (
        <div className="flex min-w-0 flex-1 flex-wrap gap-1 sm:max-w-[45%] sm:flex-none">{chips}</div>
    );

    const usage = (
        <span className="shrink-0 text-xxs text-foreground/40 whitespace-nowrap">
            {option.usageCount > 0 ? `Used by ${option.usageCount}` : "Unused"}
        </span>
    );

    const actions = (
        <div className="flex items-center gap-1 shrink-0">
            <Switch size="sm" isSelected={option.enabled} isDisabled={isOtherEditing} onValueChange={onToggleEnabled} />
            <Button
                isIconOnly
                size="sm"
                variant="light"
                isDisabled={isOtherEditing}
                aria-label={`Edit ${option.label}`}
                onPress={onEdit}
            >
                <FontAwesomeIcon icon={faPencil} />
            </Button>
            <TouchTooltip
                isDisabled={option.usageCount === 0}
                content={`Still used by ${option.usageCount} suggestion(s)`}
            >
                <span>
                    <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        color="danger"
                        isDisabled={isOtherEditing || option.usageCount > 0}
                        aria-label={`Delete ${option.label}`}
                        onPress={onDelete}
                    >
                        <FontAwesomeIcon icon={faTrash} />
                    </Button>
                </span>
            </TouchTooltip>
        </div>
    );

    return (
        <div className="flex flex-col gap-2">
            <div className="hidden sm:flex sm:items-center sm:gap-3">
                {label}
                {tags}
                <div className="flex items-center gap-3 shrink-0 sm:ml-auto">
                    {usage}
                    {actions}
                </div>
            </div>
            <div className="flex items-center gap-2 sm:hidden">
                {label}
                {actions}
            </div>
            <div className="flex items-center gap-2 sm:hidden">
                {usage}
                {tags && <span className="size-0.5 shrink-0 rounded-full bg-foreground/30" aria-hidden="true" />}
                {tags}
            </div>
        </div>
    );
}

function RowEditor({
    draft,
    set,
    errors,
    formId,
    isNew,
    kind,
    aspectSuggestions,
    archetypeSuggestions,
    onCollapse,
    onSubmit
}: {
    draft: Draft;
    set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
    errors: Record<string, string>;
    formId: string;
    isNew: boolean;
    kind: Kind;
    aspectSuggestions: string[];
    archetypeSuggestions: string[];
    onCollapse: () => void;
    onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
    const aspectKind = ASPECT_KIND[kind];
    return (
        <Form id={formId} validationErrors={errors} className="flex flex-col gap-3 pt-1" onSubmit={onSubmit}>
            <Input
                size="sm"
                label="Label"
                name="label"
                isRequired
                value={draft.label}
                onValueChange={(value) => set("label", value)}
            />
            <Input
                size="sm"
                label="Description"
                name="description"
                isRequired
                value={draft.description}
                onValueChange={(value) => set("description", value)}
            />
            <TagsField
                label={kind === "rewardOptions" ? "Aspects" : "Drawbacks"}
                values={draft.aspects}
                suggestions={aspectSuggestions}
                kind={aspectKind}
                onChange={(aspects) => set("aspects", aspects)}
            />
            <TagsField
                label="Archetypes"
                values={draft.archetypes}
                suggestions={archetypeSuggestions}
                kind="archetype"
                onChange={(archetypes) => set("archetypes", archetypes)}
            />
            <Select
                label="Keywords"
                aria-label="Keywords"
                description="Added to a suggestion automatically when its card text has one of these keywords"
                selectionMode="multiple"
                placeholder="No keywords"
                selectedKeys={new Set(draft.keywords)}
                onSelectionChange={(keys) => set("keywords", [...keys] as string[])}
            >
                {keywordNames.map((keyword) => (
                    <SelectItem key={keyword}>{keyword}</SelectItem>
                ))}
            </Select>
            {kind === "rewardOptions" && (
                <Switch isSelected={!!draft.requiresLoyalty} onValueChange={(value) => set("requiresLoyalty", value)}>
                    <div className="flex flex-col">
                        <span className="text-sm">Requires loyalty</span>
                        <span className="text-xs text-foreground/50">
                            A card granting this is expected to be marked Loyal
                        </span>
                    </div>
                </Switch>
            )}
            <Switch isSelected={draft.enabled} onValueChange={(value) => set("enabled", value)}>
                <div className="flex flex-col">
                    <span className="text-sm">Enabled</span>
                    <span className="text-xs text-foreground/50">
                        Disabled hides it from new selections, but it stays wherever already selected
                    </span>
                </div>
            </Switch>
            <FormValidationSummary errors={errors} mappedPaths={["label", "description"]} />
            <div className="flex justify-end gap-2">
                <Button size="sm" onPress={onCollapse}>
                    Cancel
                </Button>
                <Button size="sm" type="submit" form={formId} color="primary">
                    {isNew ? "Add" : "Done"}
                </Button>
            </div>
        </Form>
    );
}
