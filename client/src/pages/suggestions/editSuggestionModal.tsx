import { ICard, ICardSuggestion, ChecklistRuleId, ChecklistJustifications, IDerivedFields } from "common/models/cards";
import { IRewardPunishmentOption } from "common/models/settings";
import { BaseElementProps } from "../../types";
import classNames from "classnames";
import SuggestionEditorGuide, { isSuggestionEditorGuideDismissed } from "./suggestionEditorGuide";
import { addToast, Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import RichTextArea from "../../components/richTextArea";
import {
    useCreateSuggestionMutation,
    useDeleteSuggestionMutation,
    useGetSettingsQuery,
    useGetSuggestionPlotMedianQuery,
    useSaveDraftSuggestionMutation,
    useUpdateSuggestionMutation
} from "../../api";
import ConfirmModal from "../../components/confirmModal";
import { ReactNode, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { DeepPartial } from "common/types";
import CardEditor from "../../components/cardEditor";
import { getBaseCardValues, renderCardSuggestion } from "common/utils";
import { CardPreview } from "@agot/card-preview";
import { ValidationSummary, Wizard, WizardBack, WizardNext, WizardPage, WizardPages } from "../../components/wizard";
import { useWizard } from "../../components/wizard/context";
import { CardSuggestion } from "common/models/schemas";
import CardPickerDropdown from "../../components/data/cardPickerDropdown";
import SelectedCardImages from "../../components/data/selectedCardImages";
import { useAuth } from "../../hooks/useAuth";
import { showApiErrorToast } from "../../api/errors";
import { deriveFields } from "common/designGuidelines/deriveFields";
import { checklistRules, RuleResult } from "common/designGuidelines/checklistRules";
import SearchTagPicker from "../../components/designGuidelines/searchTagPicker";
import PivotPointsInput from "../../components/designGuidelines/pivotPointsInput";
import BooleanTileGroup from "../../components/designGuidelines/booleanTileGroup";
import CountStepper from "../../components/designGuidelines/countStepper";
import QuestionHelpIcon from "../../components/designGuidelines/questionHelpIcon";
import { SUGGESTION_QUESTIONS, SuggestionQuestionMeta } from "common/designGuidelines/suggestionQuestions";
import {
    FullChecklist,
    MiniChecklist,
    MiniChecklistIcons,
    MiniChecklistNotice
} from "../../components/designGuidelines/suggestionChecklist";
import SectionTitle from "../../components/sectionTitle";
import SectionBlurb from "../../components/sectionBlurb";
import StatusNotice from "../../components/statusNotice";
import { TouchTooltip } from "../../components/touchTooltip";
import { EASE_STANDARD } from "../../constants";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronUp, faTriangleExclamation, faUserPen } from "@fortawesome/free-solid-svg-icons";
import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { UserRow } from "../../components/userAvatar";
import useUser from "../../hooks/useUser";

const RAIL_TRANSITION = { duration: 0.25, ease: EASE_STANDARD } as const;

// Hoisted so CardEditor (memoized) sees a stable reference - an inline literal here would recreate
// every render and defeat the memo, re-rendering the whole editor on any unrelated keystroke.
const CARD_EDITOR_INPUT_OPTIONS = { designer: "hidden" } as const;

// A `?? []` fallback creates a new array every render, defeating a memoized child's memo just as
// surely as an unstable callback would - one shared empty reference instead.
const EMPTY_STRINGS: string[] = [];

// Same reasoning, for the settings query's reward/punishment lists while they're still loading
const EMPTY_REWARD_PUNISHMENT_TYPES: IRewardPunishmentOption[] = [];

// Same "shared reference, not a fresh `?? {}` every render" reasoning as EMPTY_STRINGS above.
const EMPTY_JUSTIFICATIONS: DeepPartial<ChecklistJustifications> = {};

/** Marks a section title whose answer the submit-time schema actually requires */
function RequiredMark() {
    return (
        <span className="text-danger" aria-label="required">
            {" "}
            *
        </span>
    );
}

/** Wraps a required, non-native control (no `name` a HeroUI `Form` can bind to) so an unanswered
 *  Next shows the same invalid-input language HeroUI's own fields use, not an invented style. */
function RequiredField({ name, children }: { name: string; children: ReactNode }) {
    const { validationErrors } = useWizard();
    const error = validationErrors[name];
    return (
        <div className="flex flex-col gap-1">
            <div className={classNames("rounded-medium", error && "bg-danger-50 -m-2 p-2")}>{children}</div>
            {error && <div className="pt-1 text-tiny text-danger">{error}</div>}
        </div>
    );
}

/** Title (+ RequiredMark) and blurb (+ QuestionHelpIcon, only once there's a `.question` to explain) -
 *  shared by every question section in this wizard bar the one with a differently-laid-out blurb row. */
function QuestionHeader({ question, required }: { question: SuggestionQuestionMeta; required?: boolean }) {
    return (
        <>
            <SectionTitle size="sm">
                {question.title}
                {required && <RequiredMark />}
            </SectionTitle>
            <SectionBlurb>
                {question.question ?? question.blurb}
                {question.question && <QuestionHelpIcon question={question} />}
            </SectionBlurb>
        </>
    );
}

/** Replaced by the engagement-clear warning on the last page - both stay mounted, stacked in one CSS
 *  grid cell, crossfading only opacity (not height), avoiding the "fighting for space" jitter. */
function ChecklistRail({ results, suggestion }: { results: RuleResult[]; suggestion: DeepPartial<ICardSuggestion> }) {
    const { isLastPage } = useWizard();

    if (!hasEngagementToClear(suggestion)) {
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
                    label="Reactions Will Clear"
                    detail={ENGAGEMENT_CLEAR_MESSAGE}
                />
            </div>
        </div>
    );
}

/** Mobile's collapsed resting bar - the same "on the last page, the checklist doesn't repeat itself"
 *  rule, but a text label rather than nothing, since a completely empty control invites no tap at all. */
function MobileChecklistBar({ results, onExpand }: { results: RuleResult[]; onExpand: () => void }) {
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
}

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

function SaveDraftButton({
    suggestionId,
    data,
    isDisabled,
    onSaved,
    onClose
}: {
    suggestionId?: string;
    data: DeepPartial<ICardSuggestion>;
    isDisabled?: boolean;
    onSaved: (suggestion: ICardSuggestion) => void;
    onClose: () => void;
}) {
    const [createSuggestion, { isLoading: isCreating }] = useCreateSuggestionMutation();
    const [saveDraftSuggestion, { isLoading: isUpdating }] = useSaveDraftSuggestionMutation();
    const { isValidationError, validateForm } = useWizard();

    const onPress = async () => {
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
}

// Saving an already-submitted suggestion clears reactions/approval unconditionally - purely
// informational (no confirmation modal). Ignore doesn't count as "reactions" here - not feedback.
function hasEngagementToClear(suggestion: DeepPartial<ICardSuggestion>): boolean {
    if (suggestion.draft !== false) {
        return false;
    }
    const engagement = suggestion._metadata?.engagement;
    const hasFeedbackReactions = Object.values(engagement?.reactions ?? {}).some(
        (reaction) => reaction?.type === "like" || reaction?.type === "dislike"
    );
    return hasFeedbackReactions || !!engagement?.approvedBy;
}

const ENGAGEMENT_CLEAR_MESSAGE =
    "Saving will clear this suggestion’s reactions and approval - they applied to the version being replaced.";

/** A small pulsing icon in the footer, not a full sentence - the row's width is mostly spoken for
 *  already; the explanation lives behind a tap/hover instead. */
function EngagementClearIcon({ suggestion }: { suggestion: DeepPartial<ICardSuggestion> }) {
    if (!hasEngagementToClear(suggestion)) {
        return null;
    }
    return (
        <TouchTooltip content={<div className="max-w-64 text-xs py-0.5">{ENGAGEMENT_CLEAR_MESSAGE}</div>}>
            <Button
                isIconOnly
                variant="light"
                size="sm"
                className="shrink-0 text-warning animate-pulse"
                aria-label="Saving will clear this suggestion's reactions and approval"
            >
                <FontAwesomeIcon icon={faTriangleExclamation} className="text-lg" />
            </Button>
        </TouchTooltip>
    );
}

/** Desktop-only wrapper adding the last-page fade EngagementClearIcon doesn't own itself -
 *  ChecklistRail's own crossfade takes over once this fades out. */
function DesktopEngagementClearIcon({ suggestion }: { suggestion: DeepPartial<ICardSuggestion> }) {
    const { isLastPage } = useWizard();
    return (
        <AnimatePresence>
            {hasEngagementToClear(suggestion) && !isLastPage && (
                <motion.div
                    key="engagement-clear-icon"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                >
                    <EngagementClearIcon suggestion={suggestion} />
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function SavedDraftActions({
    suggestion,
    hasCardBasics,
    isLoading,
    onDeleteRequested,
    onSaved,
    onSaveClose,
    onCancel
}: {
    suggestion: DeepPartial<ICardSuggestion>;
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
                suggestionId={suggestion.id}
                data={suggestion}
                isDisabled={!hasCardBasics}
                onSaved={onSaved}
                onClose={onSaveClose}
            />
            <WizardBack onCancel={onCancel} />
            <WizardNext isLoading={isLoading} isDisabled={!hasCardBasics} color="primary" />
        </>
    );
}

// Shared by the desktop rail and mobile footer - only the engagement-clear icon differs between them.
function StandardActions({
    suggestion,
    hasCardBasics,
    isLoading,
    engagementIcon,
    onSaved,
    onSaveClose,
    onCancel
}: {
    suggestion: DeepPartial<ICardSuggestion>;
    hasCardBasics: boolean;
    isLoading: boolean;
    engagementIcon: ReactNode;
    onSaved: (suggestion: ICardSuggestion) => void;
    onSaveClose: () => void;
    onCancel: () => void;
}) {
    return (
        <>
            {engagementIcon}
            <WizardBack onCancel={onCancel} />
            {suggestion.draft !== false && (
                <SaveDraftButton
                    suggestionId={suggestion.id}
                    data={suggestion}
                    isDisabled={!hasCardBasics}
                    onSaved={onSaved}
                    onClose={onSaveClose}
                />
            )}
            <WizardNext isLoading={isLoading} isDisabled={!hasCardBasics} color="primary" />
        </>
    );
}

const EditSuggestionModal = ({
    isOpen,
    suggestion: initial,
    onClose: onModalClose = () => true,
    onSave = () => true,
    onReturnToDrafts = () => true
}: EditSuggestionModalProps) => {
    const { user } = useAuth();
    const [createSuggestion, { isLoading: isCreating }] = useCreateSuggestionMutation();
    const [updateSuggestion, { isLoading: isSubmitting }] = useUpdateSuggestionMutation();
    const [deleteSuggestion, { isLoading: isDeletingDraft }] = useDeleteSuggestionMutation();
    const [suggestion, setSuggestion] = useState<DeepPartial<ICardSuggestion>>({});
    // Closes the editor's own Modal without telling the parent, so cancelling the confirmation
    // reopens the editor exactly where it was.
    const [isConfirmingDeleteDraft, setIsConfirmingDeleteDraft] = useState(false);
    // The mobile rail's peek state - collapsed (icons only) is the resting state, expanded shows
    // the checklist + card. See the AnimatePresence block near the footer for the fade choreography.
    const [railExpanded, setRailExpanded] = useState(false);

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
        setSuggestion({ ...initial });
        if (!initial?.id) {
            setWizardPage(1);
        }
    }, [initial]);

    // `derived` is kept live client-side too, mirroring the server's own recompute on save - lets
    // the checklist/validation work without waiting on a round trip.
    useEffect(() => {
        const derived = deriveFields(suggestion.card?.text ?? "");
        setSuggestion((prev) => ({ ...prev, derived }));
    }, [suggestion.card?.text]);

    const { card, questions, derived, pivotPoints } = suggestion;

    // Natural Trigger/Safely Limited only mean anything once there's a triggered ability to ask
    // about - gates their visibility, matching the `required()` conditional in the submit-time schema.
    const hasTriggeredAbilities = (questions?.triggeredAbilityCount ?? 0) > 0;

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

    // Reward/punishment types and loyalty tags now live in settings rather than a static import - a
    // safe empty default keeps the checklist rendering while the query is still loading.
    const { data: suggestionSettings } = useGetSettingsQuery("suggestions");
    const rewardTypeOptions = suggestionSettings?.rewardTypes ?? EMPTY_REWARD_PUNISHMENT_TYPES;
    const punishmentTypeOptions = suggestionSettings?.punishmentTypes ?? EMPTY_REWARD_PUNISHMENT_TYPES;

    // Disabled options stay picked wherever they already were, but drop out of what's offered for a
    // new selection - matches IRewardPunishmentOption.enabled's contract in common/models/settings.ts.
    const rewardTypeSelectableOptions = useMemo(
        () =>
            rewardTypeOptions.filter(
                (option) => option.enabled || (suggestion.questions?.rewardTypes ?? EMPTY_STRINGS).includes(option.id)
            ),
        [rewardTypeOptions, suggestion.questions?.rewardTypes]
    );
    const punishmentTypeSelectableOptions = useMemo(
        () =>
            punishmentTypeOptions.filter(
                (option) => option.enabled || (suggestion.questions?.punishment ?? EMPTY_STRINGS).includes(option.id)
            ),
        [punishmentTypeOptions, suggestion.questions?.punishment]
    );

    // Narrowed to only what checklistRules() actually reads - a whole-object dependency was
    // recomputing (and re-rendering every row) on every Notes/justification keystroke too.
    const checklistResults = useMemo(() => {
        if (!deferredCard?.type) {
            return [];
        }
        return checklistRules({
            card: deferredCard as ICard,
            questions: {
                rewardTypes: deferredQuestions?.rewardTypes ?? [],
                punishment: deferredQuestions?.punishment ?? [],
                triggeredAbilityCount: deferredQuestions?.triggeredAbilityCount,
                naturalTrigger: deferredQuestions?.naturalTrigger,
                repeatabilityRestricted: deferredQuestions?.repeatabilityRestricted,
                iconic: deferredQuestions?.iconic
            },
            derived: (deferredDerived as IDerivedFields) ?? { triggerTypes: [], keywords: [] },
            pivotPoints: (deferredPivotPoints ?? []).filter((p): p is string => !!p),
            plotMedian: plotPoolMedian?.median,
            rewardTypes: rewardTypeOptions,
            punishmentTypes: punishmentTypeOptions,
            loyaltyTags: suggestionSettings?.loyaltyTags ?? EMPTY_STRINGS
        });
    }, [
        deferredCard,
        deferredQuestions,
        deferredDerived,
        deferredPivotPoints,
        plotPoolMedian,
        rewardTypeOptions,
        punishmentTypeOptions,
        suggestionSettings?.loyaltyTags
    ]);

    // Nothing worth saving or moving on from until the design has at least these two basics -
    // Save Draft/Next stay disabled rather than letting either commit an unusably bare suggestion.
    const hasCardBasics = !!suggestion.card?.faction && !!suggestion.card?.type;

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

    const onCardUpdate = useCallback((card: DeepPartial<ICard>) => setSuggestion((prev) => ({ ...prev, card })), []);

    const onRewardTypesChange = useCallback(
        (rewardTypes: string[]) =>
            setSuggestion((prev) => ({ ...prev, questions: { ...prev.questions, rewardTypes } })),
        []
    );
    const onPunishmentChange = useCallback(
        (punishment: string[]) => setSuggestion((prev) => ({ ...prev, questions: { ...prev.questions, punishment } })),
        []
    );
    const onIconicChange = useCallback(
        (iconic: boolean) => setSuggestion((prev) => ({ ...prev, questions: { ...prev.questions, iconic } })),
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

    const onSubmit = async (validSuggestion: ICardSuggestion, isValidationError: (err: unknown) => boolean) => {
        try {
            let id = suggestion.id;
            if (!id) {
                const created = await createSuggestion({ ...validSuggestion, draft: true }).unwrap();
                id = created.id;
            }
            const submitted = await updateSuggestion({ ...validSuggestion, id }).unwrap();
            setSuggestion(submitted);
            onSave(submitted);
            // Submitting turns the draft into a real suggestion, so this never reopens "My Drafts".
            onModalClose();
        } catch (err) {
            if (!isValidationError(err)) {
                showApiErrorToast(err);
            }
        }
    };

    // Closes the editor, reopening "My Drafts" behind it if this was an existing saved draft.
    const closeEditor = () => {
        onModalClose();
        if (isSavedDraft) {
            onReturnToDrafts();
        }
    };

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
                placement="top-center"
                onOpenChange={(isOpen) => !isOpen && closeEditor()}
                isDismissable={false}
                size="5xl"
                scrollBehavior="inside"
            >
                <ModalContent>
                    {(onClose) => (
                        <Wizard
                            schema={CardSuggestion.Full}
                            onSubmit={onSubmit}
                            data={suggestion}
                            page={wizardPage}
                            onPageChange={setWizardPage}
                        >
                            <ModalHeader className="flex items-center gap-2">
                                <span className="flex-1 min-w-0">
                                    {isSavedDraft ? "Draft Suggestion Editor" : "Suggestion Editor"}
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
                                                <WizardPage
                                                    controlledData={{
                                                        card: getBaseCardValues(suggestion.card ?? {})
                                                    }}
                                                >
                                                    <CardEditor
                                                        className="w-full"
                                                        card={suggestion.card}
                                                        onUpdate={onCardUpdate}
                                                        inputOptions={CARD_EDITOR_INPUT_OPTIONS}
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
                                                            iconic: suggestion.questions?.iconic
                                                        }
                                                    }}
                                                >
                                                    <div className="flex flex-col gap-5 w-full">
                                                        <div className="flex flex-col gap-2 w-full">
                                                            <QuestionHeader
                                                                question={SUGGESTION_QUESTIONS.iconic}
                                                                required
                                                            />
                                                            <RequiredField name="questions.iconic">
                                                                <BooleanTileGroup
                                                                    options={SUGGESTION_QUESTIONS.iconic.options!}
                                                                    value={suggestion.questions?.iconic}
                                                                    onChange={onIconicChange}
                                                                />
                                                            </RequiredField>
                                                        </div>

                                                        <div className="flex flex-col gap-2 w-full">
                                                            <SectionTitle size="sm">
                                                                {SUGGESTION_QUESTIONS.triggeredAbilityCount.title}
                                                            </SectionTitle>
                                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                                                <SectionBlurb className="flex-1 min-w-0">
                                                                    {
                                                                        SUGGESTION_QUESTIONS.triggeredAbilityCount
                                                                            .question
                                                                    }
                                                                    <QuestionHelpIcon
                                                                        question={
                                                                            SUGGESTION_QUESTIONS.triggeredAbilityCount
                                                                        }
                                                                    />
                                                                </SectionBlurb>
                                                                <CountStepper
                                                                    className="shrink-0"
                                                                    value={suggestion.questions?.triggeredAbilityCount}
                                                                    onChange={onTriggeredAbilityCountChange}
                                                                    max={20}
                                                                />
                                                            </div>
                                                        </div>

                                                        <AnimatePresence initial={false}>
                                                            {hasTriggeredAbilities && (
                                                                <motion.div
                                                                    key="triggered-ability-details"
                                                                    initial={{ height: 0, opacity: 0 }}
                                                                    animate={{ height: "auto", opacity: 1 }}
                                                                    exit={{ height: 0, opacity: 0 }}
                                                                    transition={RAIL_TRANSITION}
                                                                    className="overflow-hidden"
                                                                >
                                                                    <div className="flex flex-col gap-5">
                                                                        <div className="flex flex-col gap-2 w-full">
                                                                            <QuestionHeader
                                                                                question={
                                                                                    SUGGESTION_QUESTIONS.naturalTrigger
                                                                                }
                                                                                required
                                                                            />
                                                                            <RequiredField name="questions.naturalTrigger">
                                                                                <BooleanTileGroup
                                                                                    options={
                                                                                        SUGGESTION_QUESTIONS
                                                                                            .naturalTrigger.options!
                                                                                    }
                                                                                    value={
                                                                                        suggestion.questions
                                                                                            ?.naturalTrigger
                                                                                    }
                                                                                    onChange={onNaturalTriggerChange}
                                                                                />
                                                                            </RequiredField>
                                                                        </div>

                                                                        <div className="flex flex-col gap-2 w-full">
                                                                            <QuestionHeader
                                                                                question={
                                                                                    SUGGESTION_QUESTIONS.repeatabilityRestricted
                                                                                }
                                                                                required
                                                                            />
                                                                            <RequiredField name="questions.repeatabilityRestricted">
                                                                                <BooleanTileGroup
                                                                                    options={
                                                                                        SUGGESTION_QUESTIONS
                                                                                            .repeatabilityRestricted
                                                                                            .options!
                                                                                    }
                                                                                    value={
                                                                                        suggestion.questions
                                                                                            ?.repeatabilityRestricted
                                                                                    }
                                                                                    onChange={
                                                                                        onRepeatabilityRestrictedChange
                                                                                    }
                                                                                />
                                                                            </RequiredField>
                                                                        </div>
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                </WizardPage>

                                                <WizardPage
                                                    controlledData={{
                                                        questions: {
                                                            rewardTypes: suggestion.questions?.rewardTypes ?? [],
                                                            punishment: suggestion.questions?.punishment ?? []
                                                        }
                                                    }}
                                                >
                                                    <div className="flex flex-col gap-5 w-full">
                                                        <div className="flex flex-col gap-2 w-full">
                                                            <QuestionHeader
                                                                question={SUGGESTION_QUESTIONS.rewardTypes}
                                                            />
                                                            <SearchTagPicker
                                                                options={rewardTypeSelectableOptions}
                                                                value={
                                                                    suggestion.questions?.rewardTypes ?? EMPTY_STRINGS
                                                                }
                                                                onChange={onRewardTypesChange}
                                                                placeholder="Search reward types by name or tag…"
                                                            />
                                                        </div>

                                                        <div className="flex flex-col gap-2 w-full">
                                                            <QuestionHeader
                                                                question={SUGGESTION_QUESTIONS.punishment}
                                                            />
                                                            <SearchTagPicker
                                                                options={punishmentTypeSelectableOptions}
                                                                value={
                                                                    suggestion.questions?.punishment ?? EMPTY_STRINGS
                                                                }
                                                                onChange={onPunishmentChange}
                                                                placeholder="Search punishment types by name or tag…"
                                                            />
                                                        </div>
                                                    </div>
                                                </WizardPage>

                                                <WizardPage
                                                    controlledData={{
                                                        pivotPoints: suggestion.pivotPoints ?? [],
                                                        comparableCards: suggestion.comparableCards ?? [],
                                                        combosWith: suggestion.combosWith ?? []
                                                    }}
                                                >
                                                    <div className="flex flex-col gap-5 w-full">
                                                        <div className="flex flex-col gap-2 w-full">
                                                            <QuestionHeader
                                                                question={SUGGESTION_QUESTIONS.pivotPoints}
                                                            />
                                                            <PivotPointsInput
                                                                className="w-full"
                                                                value={pivotPointsValue}
                                                                onChange={onPivotPointsChange}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-2 w-full">
                                                            <QuestionHeader
                                                                question={SUGGESTION_QUESTIONS.comparableCards}
                                                            />
                                                            <SelectedCardImages
                                                                value={comparableCardsValue}
                                                                onChange={onComparableCardsChange}
                                                                emptyLabel="No comparable cards selected."
                                                            />
                                                            <CardPickerDropdown
                                                                ariaLabel="Search comparable cards"
                                                                placeholder="Search by name or trait…"
                                                                value={comparableCardsValue}
                                                                onChange={onComparableCardsChange}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-2 w-full">
                                                            <QuestionHeader
                                                                question={SUGGESTION_QUESTIONS.combosWith}
                                                            />
                                                            <SelectedCardImages
                                                                value={combosWithValue}
                                                                onChange={onCombosWithChange}
                                                                emptyLabel="No combos selected."
                                                            />
                                                            <CardPickerDropdown
                                                                ariaLabel="Search combo cards"
                                                                placeholder="Search by name or trait…"
                                                                value={combosWithValue}
                                                                onChange={onCombosWithChange}
                                                            />
                                                        </div>
                                                    </div>
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
                                                    <div className="flex flex-col gap-5 w-full">
                                                        <div className="flex flex-col gap-2 w-full">
                                                            <QuestionHeader
                                                                question={SUGGESTION_QUESTIONS.checklistReview}
                                                            />
                                                            <FullChecklist
                                                                results={checklistResults}
                                                                justifications={
                                                                    suggestion.checklistJustifications ??
                                                                    EMPTY_JUSTIFICATIONS
                                                                }
                                                                onJustificationChange={onJustificationChange}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-2 w-full">
                                                            <QuestionHeader
                                                                question={SUGGESTION_QUESTIONS.editorNotes}
                                                            />
                                                            <RichTextArea
                                                                value={suggestion.notes}
                                                                onValueChange={(notes) =>
                                                                    setSuggestion((prev) => ({ ...prev, notes }))
                                                                }
                                                                placeholder="E.g. Intended as a soft counter to control decks..."
                                                            />
                                                        </div>
                                                    </div>
                                                </WizardPage>
                                            </WizardPages>
                                        </div>
                                        <div
                                            className={classNames(
                                                "hidden md:flex md:shrink-0 md:min-h-0 md:flex-col md:pr-6",
                                                isPlot ? "md:w-[calc(18rem*333/240)]" : "md:w-72"
                                            )}
                                        >
                                            <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto pr-2 pb-3">
                                                <div
                                                    className={classNames(
                                                        "w-full mx-auto",
                                                        isPlot
                                                            ? "max-w-[calc(18rem*333/240)] aspect-[333/240]"
                                                            : "max-w-72 aspect-[240/333]"
                                                    )}
                                                >
                                                    <CardPreview
                                                        card={renderedCard}
                                                        orientation={isPlot ? "horizontal" : "vertical"}
                                                        rounded
                                                    />
                                                </div>
                                                <ChecklistRail results={checklistResults} suggestion={suggestion} />
                                            </div>
                                            {isSavedDraft ? (
                                                <div className="shrink-0 grid grid-cols-2 gap-2 border-t border-content3 pt-3">
                                                    <SavedDraftActions
                                                        suggestion={suggestion}
                                                        hasCardBasics={hasCardBasics}
                                                        isLoading={isCreating || isSubmitting}
                                                        onDeleteRequested={() => setIsConfirmingDeleteDraft(true)}
                                                        onSaved={setSuggestion}
                                                        onSaveClose={closeEditor}
                                                        onCancel={onClose}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="shrink-0 flex items-center justify-end gap-2 border-t border-content3 pt-3">
                                                    <StandardActions
                                                        suggestion={suggestion}
                                                        hasCardBasics={hasCardBasics}
                                                        isLoading={isCreating || isSubmitting}
                                                        engagementIcon={
                                                            <DesktopEngagementClearIcon suggestion={suggestion} />
                                                        }
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

                            {!railExpanded && (
                                <MobileChecklistBar results={checklistResults} onExpand={() => setRailExpanded(true)} />
                            )}

                            {isSavedDraft ? (
                                <ModalFooter className="md:hidden grid grid-cols-2 gap-2">
                                    <SavedDraftActions
                                        suggestion={suggestion}
                                        hasCardBasics={hasCardBasics}
                                        isLoading={isCreating || isSubmitting}
                                        onDeleteRequested={() => setIsConfirmingDeleteDraft(true)}
                                        onSaved={setSuggestion}
                                        onSaveClose={closeEditor}
                                        onCancel={onClose}
                                    />
                                </ModalFooter>
                            ) : (
                                <ModalFooter className="md:hidden">
                                    <StandardActions
                                        suggestion={suggestion}
                                        hasCardBasics={hasCardBasics}
                                        isLoading={isCreating || isSubmitting}
                                        engagementIcon={<EngagementClearIcon suggestion={suggestion} />}
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
};

export default EditSuggestionModal;
