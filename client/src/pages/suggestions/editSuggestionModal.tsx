import {
    ICard,
    ICardSuggestion,
    ChecklistRuleId,
    ChecklistJustifications,
    GameModeType,
    IDerivedFields
} from "common/models/cards";
import { IRewardDownsideOption } from "common/models/settings";
import { BaseElementProps } from "../../types";
import classNames from "classnames";
import SuggestionEditorGuide from "./suggestionEditorGuide";
import { isSuggestionEditorGuideDismissed } from "./suggestionEditorGuideState";
import { addToast, Button, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import Modal from "../../components/modal";
import {
    useCreateSuggestionMutation,
    useDeleteSuggestionMutation,
    useGetSettingsQuery,
    useGetSuggestionPlotMedianQuery,
    useLazyGetSuggestionThreadMatchesQuery,
    useMigrateSuggestionMutation,
    useSaveDraftSuggestionMutation,
    useUpdateSuggestionMutation,
    SuggestionMigration
} from "../../api";
import ConfirmModal from "../../components/confirmModal";
import {
    ComponentProps,
    memo,
    useCallback,
    useDeferredValue,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from "react";
import { DeepPartial } from "common/types";
import CardEditor from "../../components/cardEditor";
import EditorCardPreview from "../../components/cardEditor/editorCardPreview";
import { getBaseCardValues, isSameCardStats, renderCardSuggestion } from "common/utils";
import { CardPreview } from "@agot/card-preview";
import { ValidationSummary, Wizard, WizardBack, WizardNext, WizardPage, WizardPages } from "../../components/wizard";
import { useWizard } from "../../components/wizard/context";
import { CardSuggestion } from "common/models/schemas";
import { useAuth } from "../../hooks/useAuth";
import { useStableCallback } from "../../hooks/useStableCallback";
import { showApiErrorToast } from "../../api/errors";
import { isEqual } from "lodash-es";
import { deriveFields } from "common/designGuidelines/deriveFields";
import { checklistRules, RuleResult } from "common/designGuidelines/checklistRules";
import { useKeywordSelections } from "./useKeywordSelections";
import {
    MiniChecklist,
    MiniChecklistIcons,
    MiniChecklistNotice
} from "../../components/designGuidelines/suggestionChecklist";
import StatusNotice from "../../components/statusNotice";
import { TouchTooltip } from "../../components/touchTooltip";
import { EDITOR_CARD_WIDTH, PLOT_RATIO } from "../../constants";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronUp, faTriangleExclamation, faUserPen } from "@fortawesome/free-solid-svg-icons";
import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { UserRow } from "../../components/userAvatar";
import useUser from "../../hooks/useUser";
import MigrateMergeChoice from "./migrateMergeChoice";
import LegacyThreadChoice, { POST_FRESH } from "./legacyThreadChoice";
import MigrationBanner from "./migrationBanner";
import { ContextPage, QuestionsPage, ReviewPage, RewardsPage } from "./suggestionEditorPages";
import { RAIL_TRANSITION } from "./editorTransition";

// A `?? []` fallback creates a new array every render, defeating a memoized child's memo just as
// surely as an unstable callback would - one shared empty reference instead.
const EMPTY_STRINGS: string[] = [];
const EMPTY_MODES: GameModeType[] = [];

// Same reasoning, for the settings query's reward/downside lists while they're still loading
const EMPTY_REWARD_DOWNSIDE_OPTIONS: IRewardDownsideOption[] = [];

// Same "shared reference, not a fresh `?? {}` every render" reasoning as EMPTY_STRINGS above.
const EMPTY_JUSTIFICATIONS: DeepPartial<ChecklistJustifications> = {};
const EMPTY_SUGGESTIONS: ICardSuggestion[] = [];

/** The rail's card, drawn at the largest size the room above the checklist allows - the checklist keeps its
 *  height and the card gives way, so the rail never needs to scroll. */
const RailCard = memo(function RailCard({
    card,
    isPlot
}: {
    card: ComponentProps<typeof EditorCardPreview>["card"];
    isPlot: boolean;
}) {
    const room = useRef<HTMLDivElement>(null);
    const [roomHeight, setRoomHeight] = useState<number>();

    useLayoutEffect(() => {
        const element = room.current;
        if (!element) {
            return;
        }
        const measure = () => setRoomHeight(element.clientHeight);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const fitted = roomHeight === undefined ? Infinity : isPlot ? roomHeight : roomHeight / PLOT_RATIO;
    const verticalWidth = Math.max(0, Math.min(EDITOR_CARD_WIDTH.suggestion, Math.floor(fitted)));

    return (
        <div ref={room} className="flex-1 min-h-0 min-w-0 overflow-hidden flex items-center justify-center">
            <EditorCardPreview card={card} isPlot={isPlot} verticalWidth={verticalWidth} />
        </div>
    );
});

/** Replaced by the approval-clear warning on the last page - both stay mounted, stacked in one CSS
 *  grid cell, crossfading only opacity (not height), avoiding the "fighting for space" jitter. */
const ChecklistRail = memo(function ChecklistRail({
    results,
    hasApprovalToLose
}: {
    results: RuleResult[];
    hasApprovalToLose: boolean;
}) {
    const { isLastPage } = useWizard();

    if (!hasApprovalToLose) {
        return (
            <AnimatePresence initial={false}>
                {!isLastPage && results.length > 0 && (
                    <motion.div
                        key="checklist"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={RAIL_TRANSITION}
                        className="shrink-0 overflow-hidden"
                    >
                        <MiniChecklistNotice results={results} />
                    </motion.div>
                )}
            </AnimatePresence>
        );
    }

    return (
        <div className="shrink-0 grid">
            <div
                className={classNames(
                    "col-start-1 row-start-1 transition-opacity duration-200",
                    !isLastPage && results.length > 0 ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
            >
                <MiniChecklistNotice results={results} />
            </div>
            <div
                className={classNames(
                    "col-start-1 row-start-1 transition-opacity duration-200",
                    isLastPage ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
            >
                <StatusNotice
                    icon={faTriangleExclamation}
                    color="warning"
                    label="Approval Will Clear"
                    detail={APPROVAL_CLEAR_MESSAGE}
                />
            </div>
        </div>
    );
});

/** Mobile's collapsed resting bar - the same "on the last page, the checklist doesn't repeat itself"
 *  rule, but a text label rather than nothing, since a completely empty control invites no tap at all. */
const MobileChecklistBar = memo(function MobileChecklistBar({
    results,
    onExpand
}: {
    results: RuleResult[];
    onExpand: () => void;
}) {
    const { isLastPage } = useWizard();
    return (
        <button
            type="button"
            onClick={onExpand}
            aria-label={isLastPage ? "Show card preview" : "Show checklist and card"}
            className="md:hidden shrink-0 border-t border-content3 px-4 w-full flex items-center gap-3 py-2.5 cursor-pointer"
        >
            <AnimatePresence mode="wait" initial={false}>
                {isLastPage ? (
                    <motion.span
                        key="label"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={RAIL_TRANSITION}
                        className="flex-1 text-sm text-foreground/60"
                    >
                        View Card Preview
                    </motion.span>
                ) : (
                    <motion.div
                        key="icons"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={RAIL_TRANSITION}
                        className="flex-1"
                    >
                        <MiniChecklistIcons results={results} />
                    </motion.div>
                )}
            </AnimatePresence>
            <FontAwesomeIcon icon={faChevronUp} className="shrink-0 text-foreground/40" />
        </button>
    );
});

/** The mobile overlay's own header + checklist - same last-page collapse, this time down to nothing
 *  (not even the label), since the card preview below it is the whole point of opening this panel then. */
function MobileChecklistReveal({ results, onCollapse }: { results: RuleResult[]; onCollapse: () => void }) {
    const { isLastPage } = useWizard();
    return (
        <>
            <div className="flex items-center justify-between shrink-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-foreground/40">
                    {isLastPage ? "Card Preview" : "Checklist"}
                </span>
                <button
                    type="button"
                    className="cursor-pointer text-foreground/50 hover:text-foreground"
                    onClick={onCollapse}
                    aria-label="Collapse checklist and card"
                >
                    <FontAwesomeIcon icon={faChevronDown} />
                </button>
            </div>
            <AnimatePresence initial={false}>
                {!isLastPage && (
                    <motion.div
                        key="checklist"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={RAIL_TRANSITION}
                        className="overflow-hidden shrink-0"
                    >
                        <MiniChecklist results={results} className="overflow-y-auto" />
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

const SaveDraftButton = memo(function SaveDraftButton({
    suggestionId,
    getData,
    isDisabled,
    onSaved,
    onClose
}: {
    suggestionId?: string;
    /** Read when pressed, so the button isn't redrawn by every edit to what it will save */
    getData: () => DeepPartial<ICardSuggestion>;
    isDisabled?: boolean;
    onSaved: (suggestion: ICardSuggestion) => void;
    onClose: () => void;
}) {
    const [createSuggestion, { isLoading: isCreating }] = useCreateSuggestionMutation();
    const [saveDraftSuggestion, { isLoading: isUpdating }] = useSaveDraftSuggestionMutation();
    const { isValidationError, validateForm } = useWizard();

    const onPress = async () => {
        const data = getData();
        // Validates against the permissive draft schema before saving.
        if (!validateForm(data, CardSuggestion.DraftSave)) {
            return;
        }
        try {
            const saved = suggestionId
                ? await saveDraftSuggestion({ ...data, id: suggestionId } as ICardSuggestion).unwrap()
                : await createSuggestion(data as ICardSuggestion).unwrap();
            onSaved(saved);
            addToast({
                title: "Draft saved",
                color: "success",
                description: `"${saved.card.name}" saved as a draft`
            });
            onClose();
        } catch (err) {
            if (!isValidationError(err)) {
                showApiErrorToast(err);
            }
        }
    };

    return (
        <Button variant="flat" onPress={onPress} isLoading={isCreating || isUpdating} isDisabled={isDisabled}>
            Save Draft
        </Button>
    );
});

function editorTitle(isSavedDraft: boolean, isMigrating: boolean, isLegacy: boolean) {
    if (isSavedDraft) {
        return "Draft Suggestion Editor";
    }
    if (isMigrating) {
        return "Migrate Suggestion";
    }
    return isLegacy ? "Complete Legacy Suggestion" : "Suggestion Editor";
}

// Whether saving will clear the suggestion's approval - only a change to the card's stats withdraws it (see
// clearApprovalOnStatChange on the server). Reactions always stand. Informational only.
function hasApprovalToClear(suggestion: DeepPartial<ICardSuggestion>, savedCard?: DeepPartial<ICard>): boolean {
    if (suggestion.draft !== false || suggestion.legacy || !suggestion._metadata?.engagement?.approvedBy) {
        return false;
    }
    return !isSameCardStats(savedCard, suggestion.card);
}

const APPROVAL_CLEAR_MESSAGE =
    "Saving will remove this suggestion’s approval - its stats have changed since it was approved. Reactions are kept.";

/** A small pulsing icon in the footer, not a full sentence - the row's width is mostly spoken for
 *  already; the explanation lives behind a tap/hover instead. */
function ApprovalClearIcon({ hasApprovalToLose }: { hasApprovalToLose: boolean }) {
    if (!hasApprovalToLose) {
        return null;
    }
    return (
        <TouchTooltip content={<div className="max-w-64 text-xs py-0.5">{APPROVAL_CLEAR_MESSAGE}</div>}>
            <Button
                isIconOnly
                variant="light"
                size="sm"
                className="shrink-0 text-warning animate-pulse"
                aria-label="Saving will remove this suggestion's approval"
            >
                <FontAwesomeIcon icon={faTriangleExclamation} className="text-lg" />
            </Button>
        </TouchTooltip>
    );
}

/** Desktop-only wrapper adding the last-page fade ApprovalClearIcon doesn't own itself -
 *  ChecklistRail's own crossfade takes over once this fades out. */
function DesktopApprovalClearIcon({ hasApprovalToLose }: { hasApprovalToLose: boolean }) {
    const { isLastPage } = useWizard();
    return (
        <AnimatePresence>
            {hasApprovalToLose && !isLastPage && (
                <motion.div
                    key="approval-clear-icon"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                >
                    <ApprovalClearIcon hasApprovalToLose={hasApprovalToLose} />
                </motion.div>
            )}
        </AnimatePresence>
    );
}

const SavedDraftActions = memo(function SavedDraftActions({
    suggestionId,
    getSuggestion,
    hasCardBasics,
    isLoading,
    onDeleteRequested,
    onSaved,
    onSaveClose,
    onCancel
}: {
    suggestionId?: string;
    getSuggestion: () => DeepPartial<ICardSuggestion>;
    hasCardBasics: boolean;
    isLoading: boolean;
    onDeleteRequested: () => void;
    onSaved: (suggestion: ICardSuggestion) => void;
    onSaveClose: () => void;
    onCancel: () => void;
}) {
    return (
        <>
            <Button variant="flat" color="danger" onPress={onDeleteRequested}>
                Delete Draft
            </Button>
            <SaveDraftButton
                suggestionId={suggestionId}
                getData={getSuggestion}
                isDisabled={!hasCardBasics}
                onSaved={onSaved}
                onClose={onSaveClose}
            />
            <WizardBack onCancel={onCancel} />
            <WizardNext isLoading={isLoading} isDisabled={!hasCardBasics} color="primary" />
        </>
    );
});

// Shared by the desktop rail and mobile footer - only the approval-clear icon differs between them.
const StandardActions = memo(function StandardActions({
    suggestionId,
    isDraft,
    getSuggestion,
    hasCardBasics,
    isLoading,
    engagement,
    hasApprovalToLose,
    isSubmitBlocked = false,
    onSaved,
    onSaveClose,
    onCancel
}: {
    suggestionId?: string;
    /** Whether it's still a draft - which is also true of one never saved */
    isDraft: boolean;
    getSuggestion: () => DeepPartial<ICardSuggestion>;
    hasCardBasics: boolean;
    isLoading: boolean;
    /** Which of the two sets of actions this is - the desktop rail fades its icon out on the last page */
    engagement: "desktop" | "mobile";
    hasApprovalToLose: boolean;
    /** Holds Submit back on the last page while it still has a question of its own unanswered */
    isSubmitBlocked?: boolean;
    onSaved: (suggestion: ICardSuggestion) => void;
    onSaveClose: () => void;
    onCancel: () => void;
}) {
    const { isLastPage } = useWizard();
    return (
        <>
            {engagement === "desktop" ? (
                <DesktopApprovalClearIcon hasApprovalToLose={hasApprovalToLose} />
            ) : (
                <ApprovalClearIcon hasApprovalToLose={hasApprovalToLose} />
            )}
            <WizardBack onCancel={onCancel} />
            {isDraft && (
                <SaveDraftButton
                    suggestionId={suggestionId}
                    getData={getSuggestion}
                    isDisabled={!hasCardBasics}
                    onSaved={onSaved}
                    onClose={onSaveClose}
                />
            )}
            <WizardNext
                isLoading={isLoading}
                isDisabled={!hasCardBasics || (isLastPage && isSubmitBlocked)}
                color="primary"
            />
        </>
    );
});

const EditSuggestionModal = ({
    isOpen,
    suggestion: initial,
    onClose: onModalClose = () => true,
    onSave = () => true,
    onReturnToDrafts = () => true,
    migration
}: EditSuggestionModalProps) => {
    const { user } = useAuth();
    const [createSuggestion, { isLoading: isCreating }] = useCreateSuggestionMutation();
    const [updateSuggestion, { isLoading: isUpdating }] = useUpdateSuggestionMutation();
    const [migrateSuggestion, { isLoading: isMigrating }] = useMigrateSuggestionMutation();
    const [
        findThreadMatches,
        { currentData: threadMatches, isFetching: isFindingThreads, isError: isThreadSearchError }
    ] = useLazyGetSuggestionThreadMatchesQuery();
    const isSubmitting = isUpdating || isMigrating;
    // The legacy suggestion a migration will absorb, picked on the migrate wizard's first page
    const [mergeId, setMergeId] = useState<string>();
    // Which of the designer's old forum threads completing a legacy suggestion carries over - a thread id, or
    // POST_FRESH for none - answered on the legacy editor's last page
    const [legacyThread, setLegacyThread] = useState<string>();
    const [deleteSuggestion, { isLoading: isDeletingDraft }] = useDeleteSuggestionMutation();
    const [suggestion, setSuggestion] = useState<DeepPartial<ICardSuggestion>>({});
    // Closes the editor's own Modal without telling the parent, so cancelling the confirmation
    // reopens the editor exactly where it was.
    const [isConfirmingDeleteDraft, setIsConfirmingDeleteDraft] = useState(false);
    // The mobile rail's peek state - collapsed (icons only) is the resting state, expanded shows
    // the checklist + card. See the AnimatePresence block near the footer for the fade choreography.
    const [railExpanded, setRailExpanded] = useState(false);
    const expandRail = useCallback(() => setRailExpanded(true), []);

    // Lifted here since the Wizard unmounts (and loses its own page state) behind the guide/delete-confirm.
    const [wizardPage, setWizardPage] = useState(1);

    // Re-checked on every open (not just first mount) - a dismissal from a past session should stick,
    // but the guide icon in the header can always bring it back mid-session regardless.
    const [showGuide, setShowGuide] = useState(() => !isSuggestionEditorGuideDismissed());
    // Whether the guide is showing because of the header icon, not the automatic first-open.
    const [guideOpenedManually, setGuideOpenedManually] = useState(false);
    useEffect(() => {
        if (isOpen) {
            setShowGuide(!isSuggestionEditorGuideDismissed());
            setGuideOpenedManually(false);
        }
    }, [isOpen]);

    // An unsaved suggestion has no `createdBy` yet, but is always your own
    const isEditingOthersSuggestion = !!suggestion.id && !!user && suggestion.createdBy !== user.discordId;
    const submitterName = useUser(suggestion.createdBy ?? user?.discordId).user?.displayname;

    useEffect(() => {
        setSuggestion({ ...initial, derived: deriveFields(initial?.card?.text ?? "") });
        setMergeId(undefined);
        setLegacyThread(undefined);
        if (!initial?.id) {
            setWizardPage(1);
        }
    }, [initial]);

    // Completing a legacy suggestion ends on a page offering the designer's old forum threads for the card,
    // searched afresh on leaving the first page and again whenever the forum announces a change
    const isCompletingLegacy = !migration && !!suggestion.legacy && !!suggestion.id;
    const searchThreads = useCallback(() => {
        if (suggestion.id) {
            findThreadMatches({
                id: suggestion.id,
                name: suggestion.card?.name,
                faction: suggestion.card?.faction,
                type: suggestion.card?.type
            });
        }
    }, [findThreadMatches, suggestion.id, suggestion.card?.name, suggestion.card?.faction, suggestion.card?.type]);
    const previousPage = useRef(wizardPage);
    const onPageChange = (page: number) => {
        if (isCompletingLegacy && previousPage.current === 1 && page > 1) {
            searchThreads();
        }
        previousPage.current = page;
        setWizardPage(page);
    };
    // A choice outlives the search it answered only while that search still offers it - and with nothing
    // found, posting fresh is the only answer, so it is given
    useEffect(() => {
        if (!threadMatches) {
            return;
        }
        setLegacyThread((current) =>
            threadMatches.length === 0
                ? POST_FRESH
                : current === POST_FRESH || threadMatches.some((thread) => thread.id === current)
                  ? current
                  : undefined
        );
    }, [threadMatches]);

    const mergeCandidates = migration?.candidates ?? EMPTY_SUGGESTIONS;
    const hasMergePage = mergeCandidates.length > 0;
    // Merging starts the editor from the legacy suggestion's card; not merging goes back to what the thread gave
    const onMergeChange = (id?: string) => {
        setMergeId(id);
        const merging = mergeCandidates.find((candidate) => candidate.id === id);
        resetKeywordSelections((merging?.card ?? initial?.card)?.text);
        const mergedCard = merging?.card ?? initial?.card;
        setSuggestion((prev) => ({ ...prev, card: mergedCard, derived: deriveFields(mergedCard?.text ?? "") }));
    };

    const { card, questions, derived, pivotPoints } = suggestion;

    // checklistRules()/renderCardSuggestion() are real work (keyword scans, a layout pass), and
    // `card` gets a new identity on every keystroke - deferring lets typing paint first.
    const deferredCard = useDeferredValue(card);
    const deferredQuestions = useDeferredValue(questions);
    const deferredDerived = useDeferredValue(derived);
    const deferredPivotPoints = useDeferredValue(pivotPoints);

    // Only fetched for a plot - checklistRules() ignores it entirely for every other type.
    const { data: plotPoolMedian } = useGetSuggestionPlotMedianQuery(undefined, {
        skip: deferredCard?.type !== "plot"
    });

    // An empty default keeps the checklist rendering while the query loads
    const { data: suggestionSettings } = useGetSettingsQuery("suggestions");
    const rewardOptions = suggestionSettings?.rewardOptions ?? EMPTY_REWARD_DOWNSIDE_OPTIONS;
    const downsideOptions = suggestionSettings?.downsideOptions ?? EMPTY_REWARD_DOWNSIDE_OPTIONS;

    // Disabled options stay picked wherever they already were, but drop out of what's offered for a
    // new selection - matches IRewardDownsideOption.enabled's contract in common/models/settings.ts.
    const rewardSelectableOptions = useMemo(
        () =>
            rewardOptions.filter(
                (option) => option.enabled || (suggestion.questions?.rewards ?? EMPTY_STRINGS).includes(option.id)
            ),
        [rewardOptions, suggestion.questions?.rewards]
    );
    const downsideSelectableOptions = useMemo(
        () =>
            downsideOptions.filter(
                (option) => option.enabled || (suggestion.questions?.downsides ?? EMPTY_STRINGS).includes(option.id)
            ),
        [downsideOptions, suggestion.questions?.downsides]
    );

    const selectedOptionIds = useMemo(
        () => [
            ...(suggestion.questions?.rewards ?? EMPTY_STRINGS),
            ...(suggestion.questions?.downsides ?? EMPTY_STRINGS)
        ],
        [suggestion.questions?.rewards, suggestion.questions?.downsides]
    );
    const {
        marks: keywordMarks,
        reset: resetKeywordSelections,
        onCardTextChange,
        settleRewards,
        settleDownsides
    } = useKeywordSelections({
        rewardOptions,
        downsideOptions,
        selectedIds: selectedOptionIds,
        updateSelections: (update) =>
            setSuggestion((prev) => {
                const next = update({
                    rewards: (prev.questions?.rewards ?? EMPTY_STRINGS) as string[],
                    downsides: (prev.questions?.downsides ?? EMPTY_STRINGS) as string[]
                });
                return { ...prev, questions: { ...prev.questions, ...next } };
            })
    });
    useEffect(() => resetKeywordSelections(initial?.card?.text), [initial, resetKeywordSelections]);

    // Narrowed to only what checklistRules() actually reads - a whole-object dependency was
    // recomputing (and re-rendering every row) on every Notes/justification keystroke too.
    const checklistResults = useMemo(() => {
        if (!deferredCard?.type) {
            return [];
        }
        return checklistRules({
            card: deferredCard as ICard,
            questions: {
                rewards: deferredQuestions?.rewards ?? [],
                downsides: deferredQuestions?.downsides ?? [],
                triggeredAbilityCount: deferredQuestions?.triggeredAbilityCount,
                naturalTrigger: deferredQuestions?.naturalTrigger,
                repeatabilityRestricted: deferredQuestions?.repeatabilityRestricted,
                iconic: deferredQuestions?.iconic
            },
            derived: (deferredDerived as IDerivedFields) ?? { triggerTypes: [], keywords: [] },
            pivotPoints: (deferredPivotPoints ?? []).filter((p): p is string => !!p),
            plotMedian: plotPoolMedian?.median,
            rewardOptions,
            downsideOptions
        });
    }, [
        deferredCard,
        deferredQuestions,
        deferredDerived,
        deferredPivotPoints,
        plotPoolMedian,
        rewardOptions,
        downsideOptions
    ]);

    // Nothing worth saving or moving on from until the design has at least these two basics -
    // Save Draft/Next stay disabled rather than letting either commit an unusably bare suggestion.
    const hasCardBasics = !!suggestion.card?.faction && !!suggestion.card?.type;
    // The merge page asks nothing about the card, so it never holds anyone back
    const canMoveOn = hasCardBasics || (hasMergePage && wizardPage === 1);
    // Only the first search of a card shows as loading - a refresh keeps what it already found on screen
    const isFirstThreadSearch = isFindingThreads && !threadMatches;
    const isLegacySubmitBlocked = isCompletingLegacy && (!legacyThread || isFirstThreadSearch);

    // Only a saved draft gets the Delete Draft button and its 2x2 footer layout - a new,
    // never-saved suggestion has nothing to delete (Cancel already covers that).
    const isSavedDraft = !!suggestion.id && suggestion.draft === true;

    // Stable so FullChecklist (memoized - its rows carry a `layout` animation, real work to redo on
    // every unrelated keystroke) doesn't see a new function identity on every render.
    const onJustificationChange = useCallback((rule: ChecklistRuleId, justification: string) => {
        setSuggestion((prev) => ({
            ...prev,
            checklistJustifications: { ...prev.checklistJustifications, [rule]: justification }
        }));
    }, []);

    // `derived` mirrors the server's recompute on save, kept with the edit itself rather than in a later effect
    const onCardUpdate = useCallback(
        (card: DeepPartial<ICard>) => {
            const derived = deriveFields(card.text ?? "");
            onCardTextChange(
                card.text,
                derived.keywords.map(({ keyword }) => keyword)
            );
            setSuggestion((prev) => ({
                ...prev,
                card,
                derived: isEqual(prev.derived, derived) ? prev.derived : derived
            }));
        },
        [onCardTextChange]
    );

    const onRewardsChange = useCallback(
        (rewards: string[]) => {
            settleRewards(rewards);
            setSuggestion((prev) => ({ ...prev, questions: { ...prev.questions, rewards } }));
        },
        [settleRewards]
    );
    const onDownsidesChange = useCallback(
        (downsides: string[]) => {
            settleDownsides(downsides);
            setSuggestion((prev) => ({ ...prev, questions: { ...prev.questions, downsides } }));
        },
        [settleDownsides]
    );
    const onNotesChange = useCallback((notes: string | undefined) => setSuggestion((prev) => ({ ...prev, notes })), []);
    const onIconicChange = useCallback(
        (iconic: boolean) => setSuggestion((prev) => ({ ...prev, questions: { ...prev.questions, iconic } })),
        []
    );
    const onIntendedGameModesChange = useCallback(
        (intendedGameModes: GameModeType[]) =>
            setSuggestion((prev) => ({ ...prev, questions: { ...prev.questions, intendedGameModes } })),
        []
    );
    // Dropping the count back to 0 clears Natural Trigger/Safely Limited so a stale answer can't resurface.
    const onTriggeredAbilityCountChange = useCallback((triggeredAbilityCount: number) => {
        setSuggestion((prev) => ({
            ...prev,
            questions: {
                ...prev.questions,
                triggeredAbilityCount,
                ...(triggeredAbilityCount <= 0 && { naturalTrigger: undefined, repeatabilityRestricted: undefined })
            }
        }));
    }, []);
    const onNaturalTriggerChange = useCallback(
        (naturalTrigger: boolean) =>
            setSuggestion((prev) => ({ ...prev, questions: { ...prev.questions, naturalTrigger } })),
        []
    );
    const onRepeatabilityRestrictedChange = useCallback(
        (repeatabilityRestricted: boolean) =>
            setSuggestion((prev) => ({ ...prev, questions: { ...prev.questions, repeatabilityRestricted } })),
        []
    );
    const onPivotPointsChange = useCallback(
        (pivotPoints: string[]) => setSuggestion((prev) => ({ ...prev, pivotPoints })),
        []
    );
    const onComparableCardsChange = useCallback(
        (comparableCards: string[]) => setSuggestion((prev) => ({ ...prev, comparableCards })),
        []
    );
    const onCombosWithChange = useCallback(
        (combosWith: string[]) => setSuggestion((prev) => ({ ...prev, combosWith })),
        []
    );

    // Same "a filtered `?? []` array is a fresh reference every render" concern as the callbacks
    // above - PivotPointsInput/ComboBox are memoized, so a stable array here is what lets that hold.
    const pivotPointsValue = useMemo(
        () => (suggestion.pivotPoints ?? []).filter((p): p is string => !!p),
        [suggestion.pivotPoints]
    );
    const comparableCardsValue = useMemo(
        () => (suggestion.comparableCards ?? []).filter((c): c is string => !!c),
        [suggestion.comparableCards]
    );
    const combosWithValue = useMemo(
        () => (suggestion.combosWith ?? []).filter((c): c is string => !!c),
        [suggestion.combosWith]
    );

    const finishSubmit = (submitted: ICardSuggestion) => {
        setSuggestion(submitted);
        onSave(submitted);
        // Submitting turns the draft into a real suggestion, so this never reopens "My Drafts".
        onModalClose();
    };

    const onSubmit = async (validSuggestion: ICardSuggestion, isValidationError: (err: unknown) => boolean) => {
        try {
            if (migration) {
                finishSubmit(
                    await migrateSuggestion({
                        threadId: migration.threadId,
                        mergeId,
                        suggestion: validSuggestion
                    }).unwrap()
                );
                return;
            }
            let id = suggestion.id;
            if (!id) {
                const created = await createSuggestion({ ...validSuggestion, draft: true }).unwrap();
                id = created.id;
            }
            finishSubmit(
                await updateSuggestion({
                    ...validSuggestion,
                    id,
                    legacyThread: isCompletingLegacy && legacyThread !== POST_FRESH ? legacyThread : undefined
                }).unwrap()
            );
        } catch (err) {
            if (!isValidationError(err)) {
                showApiErrorToast(err);
            }
        }
    };

    // Closes the editor, reopening "My Drafts" behind it if this was an existing saved draft.
    // Stable, with the getter below, so the buttons taking them don't re-render on every edit
    const closeEditor = useStableCallback(() => {
        onModalClose();
        if (isSavedDraft) {
            onReturnToDrafts();
        }
    });
    const requestDelete = useCallback(() => setIsConfirmingDeleteDraft(true), []);
    const suggestionRef = useRef(suggestion);
    suggestionRef.current = suggestion;
    const getSuggestion = useCallback(() => suggestionRef.current, []);
    const hasApprovalToLose = hasApprovalToClear(suggestion, initial?.card);

    // Only closes the confirmation (and the editor for good) once the delete has actually gone
    // through - a failure leaves both exactly where they were, error surfaced by toast.
    const doDeleteDraft = async () => {
        try {
            await deleteSuggestion({ id: suggestion.id! }).unwrap();
            setIsConfirmingDeleteDraft(false);
            closeEditor();
            addToast({
                title: "Draft deleted",
                color: "success",
                description: `"${suggestion.card?.name}" draft has been deleted`
            });
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Delete" });
        }
    };

    // CardPreview is itself memoized - a fresh object here would defeat that, forcing a full relayout
    // on every unrelated keystroke. Reads off `deferredCard` for the same reason as checklistResults.
    const renderedCard = useMemo(
        () => renderCardSuggestion({ card: deferredCard, id: suggestion.id }, submitterName),
        [deferredCard, suggestion.id, submitterName]
    );
    // Reads off `deferredCard` like `renderedCard` above, or the frame's orientation flips a paint ahead
    // of the card content actually catching up to the new type.
    const isPlot = deferredCard?.type === "plot";

    return (
        <>
            <Modal
                isOpen={isOpen && !isConfirmingDeleteDraft && !showGuide}
                onOpenChange={(isOpen) => !isOpen && closeEditor()}
                isDismissable={false}
                size="5xl"
            >
                <ModalContent>
                    {(onClose) => (
                        <Wizard
                            schema={CardSuggestion.Full}
                            onSubmit={onSubmit}
                            data={suggestion}
                            page={wizardPage}
                            onPageChange={onPageChange}
                        >
                            <ModalHeader className="flex items-center gap-2">
                                <span className="flex-1 min-w-0">
                                    {editorTitle(isSavedDraft, !!migration, !!suggestion.legacy)}
                                    <button
                                        type="button"
                                        aria-label="Show the suggestion editor guide"
                                        onClick={() => {
                                            setShowGuide(true);
                                            setGuideOpenedManually(true);
                                        }}
                                        className="ml-2 inline-flex align-middle text-primary/70 hover:text-primary"
                                    >
                                        <FontAwesomeIcon icon={faCircleQuestion} className="text-lg" />
                                    </button>
                                </span>
                            </ModalHeader>
                            <div className="relative flex-1 min-h-0 flex flex-col">
                                <ModalBody className="flex-1 min-h-0 overflow-hidden px-0">
                                    <div className="px-6">
                                        <ValidationSummary />
                                        {migration && <MigrationBanner thread={migration.thread} className="mb-3" />}
                                        {isEditingOthersSuggestion && (
                                            <StatusNotice
                                                icon={faUserPen}
                                                color="info"
                                                label="Editing Another User's Suggestion"
                                                detail={
                                                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                                        <span>You are amending</span>
                                                        <UserRow
                                                            discordId={suggestion.createdBy!}
                                                            className="w-auto"
                                                            avatarClassName="!size-4"
                                                            textClassName="text-xs"
                                                        />
                                                        <span>'s suggestion on their behalf.</span>
                                                    </span>
                                                }
                                                className="mb-2 shrink-0"
                                            />
                                        )}
                                    </div>
                                    <div className="flex flex-1 min-h-0 flex-col md:flex-row gap-2">
                                        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto px-6 md:pr-2">
                                            <WizardPages>
                                                {hasMergePage && (
                                                    <WizardPage controlledData={{}}>
                                                        <MigrateMergeChoice
                                                            candidates={mergeCandidates}
                                                            value={mergeId}
                                                            onChange={onMergeChange}
                                                        />
                                                    </WizardPage>
                                                )}
                                                <WizardPage
                                                    controlledData={{
                                                        card: getBaseCardValues(suggestion.card ?? {})
                                                    }}
                                                >
                                                    <CardEditor
                                                        className="w-full"
                                                        card={suggestion.card}
                                                        onUpdate={onCardUpdate}
                                                        for="card"
                                                    />
                                                </WizardPage>

                                                <WizardPage
                                                    controlledData={{
                                                        questions: {
                                                            triggeredAbilityCount:
                                                                suggestion.questions?.triggeredAbilityCount,
                                                            naturalTrigger: suggestion.questions?.naturalTrigger,
                                                            repeatabilityRestricted:
                                                                suggestion.questions?.repeatabilityRestricted,
                                                            iconic: suggestion.questions?.iconic,
                                                            intendedGameModes:
                                                                suggestion.questions?.intendedGameModes ?? EMPTY_MODES
                                                        }
                                                    }}
                                                >
                                                    <QuestionsPage
                                                        iconic={suggestion.questions?.iconic}
                                                        intendedGameModes={
                                                            (suggestion.questions?.intendedGameModes ??
                                                                EMPTY_MODES) as GameModeType[]
                                                        }
                                                        triggeredAbilityCount={
                                                            suggestion.questions?.triggeredAbilityCount
                                                        }
                                                        naturalTrigger={suggestion.questions?.naturalTrigger}
                                                        repeatabilityRestricted={
                                                            suggestion.questions?.repeatabilityRestricted
                                                        }
                                                        onIconicChange={onIconicChange}
                                                        onIntendedGameModesChange={onIntendedGameModesChange}
                                                        onTriggeredAbilityCountChange={onTriggeredAbilityCountChange}
                                                        onNaturalTriggerChange={onNaturalTriggerChange}
                                                        onRepeatabilityRestrictedChange={
                                                            onRepeatabilityRestrictedChange
                                                        }
                                                    />
                                                </WizardPage>

                                                <WizardPage
                                                    controlledData={{
                                                        questions: {
                                                            rewards: suggestion.questions?.rewards ?? [],
                                                            downsides: suggestion.questions?.downsides ?? []
                                                        }
                                                    }}
                                                >
                                                    <RewardsPage
                                                        rewards={
                                                            (suggestion.questions?.rewards ?? EMPTY_STRINGS) as string[]
                                                        }
                                                        downsides={
                                                            (suggestion.questions?.downsides ??
                                                                EMPTY_STRINGS) as string[]
                                                        }
                                                        rewardOptions={rewardSelectableOptions}
                                                        downsideOptions={downsideSelectableOptions}
                                                        marks={keywordMarks}
                                                        onRewardsChange={onRewardsChange}
                                                        onDownsidesChange={onDownsidesChange}
                                                    />
                                                </WizardPage>

                                                <WizardPage
                                                    controlledData={{
                                                        pivotPoints: suggestion.pivotPoints ?? [],
                                                        comparableCards: suggestion.comparableCards ?? [],
                                                        combosWith: suggestion.combosWith ?? []
                                                    }}
                                                >
                                                    <ContextPage
                                                        pivotPoints={pivotPointsValue}
                                                        comparableCards={comparableCardsValue}
                                                        combosWith={combosWithValue}
                                                        onPivotPointsChange={onPivotPointsChange}
                                                        onComparableCardsChange={onComparableCardsChange}
                                                        onCombosWithChange={onCombosWithChange}
                                                    />
                                                </WizardPage>

                                                <WizardPage
                                                    controlledData={{
                                                        checklistJustifications:
                                                            suggestion.checklistJustifications ?? EMPTY_JUSTIFICATIONS,
                                                        notes: suggestion.notes,
                                                        derived: suggestion.derived,
                                                        draft: false
                                                    }}
                                                >
                                                    <ReviewPage
                                                        results={checklistResults}
                                                        justifications={
                                                            suggestion.checklistJustifications ?? EMPTY_JUSTIFICATIONS
                                                        }
                                                        notes={suggestion.notes}
                                                        onJustificationChange={onJustificationChange}
                                                        onNotesChange={onNotesChange}
                                                    />
                                                </WizardPage>
                                                {isCompletingLegacy && (
                                                    <WizardPage controlledData={{}}>
                                                        <LegacyThreadChoice
                                                            threads={threadMatches}
                                                            isLoading={isFirstThreadSearch}
                                                            isError={isThreadSearchError}
                                                            value={legacyThread}
                                                            onChange={setLegacyThread}
                                                            onSearch={searchThreads}
                                                        />
                                                    </WizardPage>
                                                )}
                                            </WizardPages>
                                        </div>
                                        <div
                                            className={classNames(
                                                "hidden md:flex md:shrink-0 md:min-h-0 md:flex-col md:pr-6",
                                                isPlot ? "md:w-[calc(18rem*333/240+2rem)]" : "md:w-80"
                                            )}
                                        >
                                            <div className="flex-1 min-h-0 min-w-0 flex flex-col gap-3 overflow-hidden pr-2 pb-3">
                                                <RailCard card={renderedCard} isPlot={isPlot} />
                                                <ChecklistRail
                                                    results={checklistResults}
                                                    hasApprovalToLose={hasApprovalToLose}
                                                />
                                            </div>
                                            {isSavedDraft ? (
                                                <div className="shrink-0 grid grid-cols-2 gap-2 border-t border-content3 pt-3">
                                                    <SavedDraftActions
                                                        suggestionId={suggestion.id}
                                                        getSuggestion={getSuggestion}
                                                        hasCardBasics={canMoveOn}
                                                        isLoading={isCreating || isSubmitting}
                                                        onDeleteRequested={requestDelete}
                                                        onSaved={setSuggestion}
                                                        onSaveClose={closeEditor}
                                                        onCancel={onClose}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="shrink-0 flex items-center justify-end gap-2 border-t border-content3 pt-3">
                                                    <StandardActions
                                                        suggestionId={suggestion.id}
                                                        isDraft={suggestion.draft !== false}
                                                        getSuggestion={getSuggestion}
                                                        hasCardBasics={canMoveOn}
                                                        isLoading={isCreating || isSubmitting}
                                                        engagement="desktop"
                                                        hasApprovalToLose={hasApprovalToLose}
                                                        isSubmitBlocked={isLegacySubmitBlocked}
                                                        onSaved={setSuggestion}
                                                        onSaveClose={closeEditor}
                                                        onCancel={onClose}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </ModalBody>

                                <AnimatePresence>
                                    {railExpanded && (
                                        <motion.div
                                            key="mobile-reveal"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={RAIL_TRANSITION}
                                            className="md:hidden absolute inset-0 z-20 bg-content1 flex flex-col gap-3 p-4"
                                        >
                                            <MobileChecklistReveal
                                                results={checklistResults}
                                                onCollapse={() => setRailExpanded(false)}
                                            />
                                            <div className="flex-1 min-h-0 flex flex-col gap-3">
                                                <div className="flex-1 min-h-0 flex items-center justify-center">
                                                    <div
                                                        className="h-full max-w-full"
                                                        style={{ aspectRatio: isPlot ? "333 / 240" : "240 / 333" }}
                                                    >
                                                        <CardPreview
                                                            card={renderedCard}
                                                            orientation={isPlot ? "horizontal" : "vertical"}
                                                            rounded
                                                            className="h-full w-full"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {!railExpanded && <MobileChecklistBar results={checklistResults} onExpand={expandRail} />}

                            {isSavedDraft ? (
                                <ModalFooter className="md:hidden grid grid-cols-2 gap-2">
                                    <SavedDraftActions
                                        suggestionId={suggestion.id}
                                        getSuggestion={getSuggestion}
                                        hasCardBasics={canMoveOn}
                                        isLoading={isCreating || isSubmitting}
                                        onDeleteRequested={requestDelete}
                                        onSaved={setSuggestion}
                                        onSaveClose={closeEditor}
                                        onCancel={onClose}
                                    />
                                </ModalFooter>
                            ) : (
                                <ModalFooter className="md:hidden">
                                    <StandardActions
                                        suggestionId={suggestion.id}
                                        isDraft={suggestion.draft !== false}
                                        getSuggestion={getSuggestion}
                                        hasCardBasics={canMoveOn}
                                        isLoading={isCreating || isSubmitting}
                                        engagement="mobile"
                                        hasApprovalToLose={hasApprovalToLose}
                                        isSubmitBlocked={isLegacySubmitBlocked}
                                        onSaved={setSuggestion}
                                        onSaveClose={closeEditor}
                                        onCancel={onClose}
                                    />
                                </ModalFooter>
                            )}
                        </Wizard>
                    )}
                </ModalContent>
            </Modal>
            <SuggestionEditorGuide
                isOpen={isOpen && showGuide}
                isReturningToEditor={guideOpenedManually}
                onDismiss={() => setShowGuide(false)}
                onClose={closeEditor}
            />
            <ConfirmModal
                isOpen={isConfirmingDeleteDraft}
                isLoading={isDeletingDraft}
                title="Delete draft suggestion?"
                content={
                    <div>
                        This will permanently delete <span className="font-bold">{suggestion.card?.name}</span>, and
                        cannot be undone.
                    </div>
                }
                confirmContent="Delete"
                onConfirm={doDeleteDraft}
                onClose={() => setIsConfirmingDeleteDraft(false)}
            />
        </>
    );
};

type EditSuggestionModalProps = Omit<BaseElementProps, "children"> & {
    isOpen: boolean;
    suggestion?: DeepPartial<ICardSuggestion>;
    onClose?: () => void;
    onSave?: (suggestion: ICardSuggestion) => void;
    /** Fires when a saved draft's editor closes without submitting, so the caller can reopen "My Drafts". */
    onReturnToDrafts?: () => void;
    /** Set when the editor is migrating an old suggestion-forum thread (from Discord's /migrate) - submitting
     *  then goes through the migration route, with no draft stage, merging any legacy suggestion picked. */
    migration?: SuggestionMigration & { threadId: string };
};

export default EditSuggestionModal;
