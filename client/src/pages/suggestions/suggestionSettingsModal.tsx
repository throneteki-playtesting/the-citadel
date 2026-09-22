import { FormEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { omit } from "lodash-es";
import {
    addToast,
    Button,
    Divider,
    Form,
    Input,
    Modal,
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
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faPencil, faPlus, faTrash, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { isDirty } from "common/utils";
import { IRewardPunishmentOption, ISuggestionsSettings } from "common/models/settings";
import { RewardPunishmentOption } from "common/models/schemas";
import { useGetSettingsQuery, useUpdateSettingsMutation } from "../../api";
import { useFormValidation } from "../../hooks/useFormValidation";
import FormValidationSummary from "../../components/formValidationSummary";
import ComboBox from "../../components/combobox";
import ExamplesInput from "./examplesInput";
import { showApiErrorToast } from "../../api/errors";
import { fuzzyMatch } from "../../utils";
import { TouchTooltip } from "../../components/touchTooltip";
import { EASE_STANDARD } from "../../constants";
import { scrollableTabs } from "../../hooks/useSelectedTabInView";
import useDebounce from "../../hooks/useDebounce";
import SlidingPages from "../../components/slidingPages";

// The row's own presence in the list (insertion/removal) - separate from, and deliberately not as fast
// as, the edit/view crossfade below.
const ROW_TRANSITION = { duration: 0.2, ease: EASE_STANDARD } as const;

const SEARCH_DEBOUNCE_MS = 150;

// The GET response annotates each option with how many suggestions currently use it, purely for this
// modal's own delete-guard - stripped again in stripUsage before every PATCH, never persisted back.
type OptionWithUsage = IRewardPunishmentOption & { usageCount: number };
type SettingsResponse = Omit<ISuggestionsSettings, "rewardTypes" | "punishmentTypes"> & {
    rewardTypes: OptionWithUsage[];
    punishmentTypes: OptionWithUsage[];
};
type Kind = "rewardTypes" | "punishmentTypes";
type Draft = IRewardPunishmentOption;

// The modal's single local edit session - everything a footer Save writes in one PATCH.
type SettingsDraft = {
    minimumLikesThreshold: number;
    loyaltyTags: string[];
    rewardTypes: OptionWithUsage[];
    punishmentTypes: OptionWithUsage[];
};

function stripUsage(options: OptionWithUsage[]): IRewardPunishmentOption[] {
    return options.map((option) => omit(option, "usageCount"));
}

// Order-independent - matches the same comparison the settings route uses server-side to decide
// whether a save needs to bulk-resync suggestion tags (server/src/routes/API/v1/settings.ts).
function sameTagSet(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    const setA = new Set(a);
    return b.every((tag) => setA.has(tag));
}

// Whether saving would trigger the (slower) bulk tag resync - only an EXISTING option's own tags
// changing counts, matching the server's own resync trigger exactly.
function hasChangedTags(original: OptionWithUsage[], current: OptionWithUsage[]): boolean {
    const originalTagsById = new Map(original.map((option) => [option.id, option.tags]));
    return current.some((option) => {
        const originalTags = originalTagsById.get(option.id);
        return originalTags !== undefined && !sameTagSet(originalTags, option.tags);
    });
}

/** Reward/punishment type settings, as a modal rather than its own page. One edit session: every row
 *  action and scalar field mutates a single local draft until the footer Save. */
export default function SuggestionSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const {
        data: rawData,
        isLoading,
        isError,
        refetch
    } = useGetSettingsQuery({ type: "suggestions", includeUsage: true }, { skip: !isOpen });
    const data = rawData as SettingsResponse | undefined;
    const [updateSettings, { isLoading: isSaving }] = useUpdateSettingsMutation();

    const [tab, setTab] = useState<Kind>("rewardTypes");
    // Punishments is the tab most sessions never open - deferring its list's mount until it's actually
    // been viewed once means a reward-only session never pays for building it.
    const [hasViewedPunishments, setHasViewedPunishments] = useState(false);
    useEffect(() => {
        if (tab === "punishmentTypes") {
            setHasViewedPunishments(true);
        }
    }, [tab]);

    // Seeded once from the first successful load after opening, so a background refetch mid-edit can't
    // clobber it. `original` is the frozen snapshot dirty comparisons run against.
    const [draft, setDraft] = useState<SettingsDraft | undefined>(undefined);
    const originalRef = useRef<SettingsDraft | undefined>(undefined);
    useEffect(() => {
        if (data && !draft) {
            const snapshot: SettingsDraft = {
                minimumLikesThreshold: data.minimumLikesThreshold,
                loyaltyTags: data.loyaltyTags,
                rewardTypes: data.rewardTypes,
                punishmentTypes: data.punishmentTypes
            };
            setDraft(snapshot);
            originalRef.current = snapshot;
        }
    }, [data, draft]);
    useEffect(() => {
        if (!isOpen) {
            setDraft(undefined);
            originalRef.current = undefined;
            setTab("rewardTypes");
            setHasViewedPunishments(false);
        }
    }, [isOpen]);

    // Every tag currently defined on a reward type - loyalty tags are drawn from that same vocabulary.
    const rewardTagOptions = useMemo(
        () => [...new Set((draft?.rewardTypes ?? []).flatMap((option) => option.tags))],
        [draft?.rewardTypes]
    );

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

    const onUpsertOption = useCallback((kind: Kind, option: IRewardPunishmentOption) => {
        updateOptions(kind, (options) =>
            options.some((entry) => entry.id === option.id)
                ? options.map((entry) => (entry.id === option.id ? { ...option, usageCount: entry.usageCount } : entry))
                : [...options, { ...option, usageCount: 0 }]
        );
    }, []);

    // Whole-array comparisons (add/edit/delete/reorder all show up as a difference) - same helper the
    // per-row dot and the footer Save button already use, just scoped to one kind's array at a time.
    const rewardTypesDirty = isDirty(originalRef.current?.rewardTypes, draft?.rewardTypes);
    const punishmentTypesDirty = isDirty(originalRef.current?.punishmentTypes, draft?.punishmentTypes);

    // Mirrors the server's own trigger for the bulk suggestion-tags resync - shown so a slower save
    // isn't a surprise, not to gate anything (the server decides for real, this is just a heads-up).
    const willResyncTags =
        !!originalRef.current &&
        !!draft &&
        (hasChangedTags(originalRef.current.rewardTypes, draft.rewardTypes) ||
            hasChangedTags(originalRef.current.punishmentTypes, draft.punishmentTypes));

    const onSave = async () => {
        if (!draft) {
            return;
        }
        try {
            await updateSettings({
                type: "suggestions",
                data: {
                    minimumLikesThreshold: draft.minimumLikesThreshold,
                    loyaltyTags: draft.loyaltyTags,
                    rewardTypes: stripUsage(draft.rewardTypes),
                    punishmentTypes: stripUsage(draft.punishmentTypes)
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
        <Modal isOpen={isOpen} size="5xl" scrollBehavior="inside" onOpenChange={(open) => !open && onClose()}>
            <ModalContent>
                <ModalHeader>Suggestion Settings</ModalHeader>
                <ModalBody className="gap-6 pb-6">
                    {isLoading || !draft ? (
                        <SettingsSkeleton />
                    ) : isError ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                            <FontAwesomeIcon icon={faTriangleExclamation} className="text-4xl text-warning" />
                            <div className="text-sm text-foreground/70">
                                Something went wrong loading settings. Please try again shortly.
                            </div>
                            <Button variant="flat" color="primary" onPress={() => refetch()}>
                                Retry
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-col gap-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                                    <Input
                                        type="number"
                                        label="Minimum likes threshold"
                                        description="Likes a suggestion needs before it's flagged as awaiting approval"
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
                                    <Select
                                        aria-label="Loyalty tags"
                                        label="Loyalty tags"
                                        description="Tags which, when present on a selected reward, trigger the loyalty-consistency checklist rule"
                                        selectionMode="multiple"
                                        placeholder="No loyalty tags selected"
                                        classNames={{ value: "uppercase tracking-wide" }}
                                        selectedKeys={new Set(draft.loyaltyTags)}
                                        onSelectionChange={(keys) =>
                                            setDraft(
                                                (previous) =>
                                                    previous && { ...previous, loyaltyTags: [...keys] as string[] }
                                            )
                                        }
                                    >
                                        {rewardTagOptions.map((tag) => (
                                            <SelectItem key={tag} textValue={tag}>
                                                <span className="uppercase tracking-wide">{tag}</span>
                                            </SelectItem>
                                        ))}
                                    </Select>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <Tabs
                                    classNames={scrollableTabs}
                                    selectedKey={tab}
                                    onSelectionChange={(key) => setTab(key as Kind)}
                                    aria-label="Reward and punishment types"
                                    variant="underlined"
                                    color="primary"
                                    size="lg"
                                >
                                    <Tab
                                        key="rewardTypes"
                                        title={<TabTitle label="Rewards" isDirty={rewardTypesDirty} />}
                                    />
                                    <Tab
                                        key="punishmentTypes"
                                        title={<TabTitle label="Punishments" isDirty={punishmentTypesDirty} />}
                                    />
                                </Tabs>
                                <SlidingPages currentPage={tab === "rewardTypes" ? 1 : 2}>
                                    <RewardPunishmentList
                                        kindLabel="Reward Type"
                                        options={draft.rewardTypes}
                                        originalOptions={originalRef.current?.rewardTypes ?? []}
                                        isOpen={isOpen}
                                        isActivePage={tab === "rewardTypes"}
                                        onUpsertOption={(option) => onUpsertOption("rewardTypes", option)}
                                        onToggleEnabled={(id) => onToggleEnabled("rewardTypes", id)}
                                        onDelete={(id) => onDeleteOption("rewardTypes", id)}
                                    />
                                    <div>
                                        {hasViewedPunishments && (
                                            <RewardPunishmentList
                                                kindLabel="Punishment Type"
                                                options={draft.punishmentTypes}
                                                originalOptions={originalRef.current?.punishmentTypes ?? []}
                                                isOpen={isOpen}
                                                isActivePage={tab === "punishmentTypes"}
                                                onUpsertOption={(option) => onUpsertOption("punishmentTypes", option)}
                                                onToggleEnabled={(id) => onToggleEnabled("punishmentTypes", id)}
                                                onDelete={(id) => onDeleteOption("punishmentTypes", id)}
                                            />
                                        )}
                                    </div>
                                </SlidingPages>
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

function SettingsSkeleton() {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
                <Skeleton className="h-6 w-32 rounded-lg" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Skeleton className="h-14 w-full rounded-lg" />
                    <Skeleton className="h-14 w-full rounded-lg" />
                </div>
            </div>
            <div className="flex flex-col gap-3">
                <Skeleton className="h-6 w-56 rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
                <div className="flex flex-col gap-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-16 w-full rounded-lg" />
                    ))}
                </div>
            </div>
        </div>
    );
}

function RewardPunishmentList({
    kindLabel,
    options,
    originalOptions,
    isOpen,
    isActivePage,
    onUpsertOption,
    onToggleEnabled,
    onDelete
}: {
    kindLabel: string;
    options: OptionWithUsage[];
    originalOptions: OptionWithUsage[];
    isOpen: boolean;
    isActivePage: boolean;
    onUpsertOption: (option: IRewardPunishmentOption) => void;
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
                    fuzzyMatch([option.label, option.description, ...option.tags].join(" "), debouncedSearch)
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
            examples: [],
            tags: [],
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
        (option: IRewardPunishmentOption) => {
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

    const toggleEnabledRow = useCallback((id: string) => guardExisting(id, onToggleEnabled), [
        guardExisting,
        onToggleEnabled
    ]);

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
                    placeholder={`Search ${kindLabel.toLowerCase()}s by name or tag…`}
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
    onEdit: (id: string) => void;
    onCollapse: (id: string) => void;
    onSubmit: (option: IRewardPunishmentOption) => void;
    onToggleEnabled: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const [draft, setDraft] = useState<Draft>(() => omit(option, "usageCount"));
    const { errors, validate, clearErrors } = useFormValidation(RewardPunishmentOption.Draft);

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
        const body: IRewardPunishmentOption = {
            id: draft.id,
            label: draft.label.trim(),
            description: draft.description.trim(),
            examples: draft.examples,
            tags: draft.tags,
            enabled: draft.enabled
        };
        if (!validate(body)) {
            return;
        }
        onSubmit(body);
    };

    const FORM_ID = `reward-punishment-form-${option.id}`;

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
    isDirty,
    isOtherEditing,
    onEdit,
    onToggleEnabled,
    onDelete
}: {
    option: OptionWithUsage;
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

    const tags = option.tags.length > 0 && (
        <div
            className="min-w-0 flex-1 sm:flex-none sm:max-w-[30%] truncate text-xxs uppercase tracking-wide text-foreground/40"
            title={option.tags.join(", ")}
        >
            {option.tags.join(", ")}
        </div>
    );

    const usage = (
        <span className="shrink-0 text-xxs text-foreground/40 whitespace-nowrap">
            {option.usageCount > 0 ? `Used by ${option.usageCount}` : "Unused"}
        </span>
    );

    const actions = (
        <div className="flex items-center gap-1 shrink-0">
            <Switch
                size="sm"
                isSelected={option.enabled}
                isDisabled={isOtherEditing}
                onValueChange={onToggleEnabled}
            />
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
    onCollapse,
    onSubmit
}: {
    draft: Draft;
    set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
    errors: Record<string, string>;
    formId: string;
    isNew: boolean;
    onCollapse: () => void;
    onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
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
            <ComboBox
                label="Tags"
                placeholder="Type and press enter"
                values={draft.tags}
                onChange={(tags) => set("tags", tags)}
                chip={{
                    color: "default",
                    variant: "flat",
                    className: "rounded-sm p-0 pr-0.5 border-1 border-content2 uppercase tracking-wide"
                }}
            />
            <div className="flex w-full flex-col gap-1">
                <span className="text-sm">Examples</span>
                <ExamplesInput value={draft.examples} onChange={(examples) => set("examples", examples)} />
            </div>
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
