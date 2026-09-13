import {
    AbilityType,
    ICard,
    ICardSuggestion,
    ChecklistRuleId,
    ChecklistJustifications,
    IDerivedFields,
    ISuggestionQuestions,
    IRepeatability,
    TriggerReliability
} from "common/models/cards";
import { BaseElementProps } from "../../types";
import classNames from "classnames";
import { addToast, Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Textarea } from "@heroui/react";
import { useCreateSuggestionMutation, useSaveDraftSuggestionMutation, useUpdateSuggestionMutation } from "../../api";
import { ReactNode, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { DeepPartial } from "common/types";
import CardEditor from "../../components/cardEditor";
import { getBaseCardValues, renderCardSuggestion } from "common/utils";
import { CardPreview } from "@agot/card-preview";
import { ValidationSummary, Wizard, WizardBack, WizardNext, WizardPage, WizardPages } from "../../components/wizard";
import { useWizard } from "../../components/wizard/context";
import { CardSuggestion } from "common/models/schemas";
import CardMultiSelect from "../../components/data/cardMultiSelect";
import SelectedCardChips from "../../components/data/selectedCardChips";
import { useAuth } from "../../hooks/useAuth";
import { showApiErrorToast } from "../../api/errors";
import { REWARD_TYPES } from "common/designGuidelines/rewardTypes";
import { PUNISHMENT_TYPES } from "common/designGuidelines/punishmentTypes";
import { deriveFields, hasPassiveAbility, hasTriggeredAbility } from "common/designGuidelines/deriveFields";
import { checklistRules, RuleResult } from "common/designGuidelines/checklistRules";
import RepeatabilityTiles from "../../components/designGuidelines/repeatabilityTiles";
import SearchTagPicker, { SelectedTagChips } from "../../components/designGuidelines/searchTagPicker";
import PivotPointsInput from "../../components/designGuidelines/pivotPointsInput";
import TriggerReliabilityCards from "../../components/designGuidelines/triggerReliabilityCards";
import IconicSwitch from "../../components/designGuidelines/iconicSwitch";
import AbilityTypeToggle from "../../components/designGuidelines/abilityTypeToggle";
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
import { SUGGESTION_SECTION_DESCRIPTIONS } from "common/designGuidelines/sectionDescriptions";
import { EASE_STANDARD } from "../../constants";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faChevronDown,
    faChevronUp,
    faCheck,
    faPencil,
    faTriangleExclamation,
    faUserPen
} from "@fortawesome/free-solid-svg-icons";
import { UserRow } from "../../components/userAvatar";

const RAIL_TRANSITION = { duration: 0.25, ease: EASE_STANDARD } as const;

// Hoisted so CardEditor (memoized) sees a stable reference - an inline literal here would recreate
// every render and defeat the memo, re-rendering the whole editor on any unrelated keystroke.
const CARD_EDITOR_INPUT_OPTIONS = { designer: "hidden" } as const;

// A `?? []` fallback creates a new array every render, defeating a memoized child's memo just as
// surely as an unstable callback would - one shared empty reference instead.
const EMPTY_STRINGS: string[] = [];

// Same "shared reference, not a fresh `?? {}` every render" reasoning as EMPTY_STRINGS above.
const EMPTY_JUSTIFICATIONS: DeepPartial<ChecklistJustifications> = {};
const EMPTY_TRIGGER_RELIABILITY: TriggerReliability[] = [];

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

/** A subheading one step down from `SectionTitle` - for a question that's part of a larger one
 *  (eg. Trigger Reliability/Repeatability under Ability Types) rather than a page section of its own. */
function SubTitle({ children }: { children: ReactNode }) {
    return <span className="text-xs font-semibold uppercase tracking-wide text-foreground/50">{children}</span>;
}

/** A question most cards don't answer (rewards, punishment) - collapsed by default so an empty
 *  picker doesn't spend space on every suggestion; chips can't be removed while collapsed. */
function CollapsibleQuestion({
    title,
    blurb,
    isOpen,
    onOpenChange,
    alwaysVisible,
    children
}: {
    title: string;
    blurb: string;
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    /** Rendered between the blurb and the collapsible area, regardless of open/closed - the current
     *  answer (eg. selected chips) so collapsing only hides the picker, never the answer itself. */
    alwaysVisible?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-2 w-full">
            <div className="flex w-full items-center gap-2">
                <SectionTitle size="sm" className="flex-1 min-w-0">
                    {title}
                </SectionTitle>
                <Button
                    size="sm"
                    variant="bordered"
                    color={isOpen ? "success" : "primary"}
                    className="shrink-0"
                    startContent={<FontAwesomeIcon icon={isOpen ? faCheck : faPencil} />}
                    onPress={() => onOpenChange(!isOpen)}
                >
                    {isOpen ? "Close" : "Edit"}
                </Button>
            </div>
            {/* Only ever used for Rewards/Punishment (see below) - capped at 2 lines since these two
            descriptions run longer than most, and the section is collapsible anyway. */}
            <SectionBlurb className="line-clamp-2">{blurb}</SectionBlurb>
            {alwaysVisible}
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={RAIL_TRANSITION}
                        className="overflow-hidden"
                    >
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/** Replaced by the engagement-clear warning on the last page - both stay mounted, stacked in one CSS
 *  grid cell, crossfading only opacity (not height), avoiding the "fighting for space" jitter. */
function ChecklistRail({ results, suggestion }: { results: RuleResult[]; suggestion: DeepPartial<ICardSuggestion> }) {
    const { isLastPage } = useWizard();

    if (!hasEngagementToClear(suggestion)) {
        return (
            <AnimatePresence initial={false}>
                {!isLastPage && (
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
                    isLastPage ? "opacity-0 pointer-events-none" : "opacity-100"
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
    onSaved,
    onClose
}: {
    suggestionId?: string;
    data: DeepPartial<ICardSuggestion>;
    onSaved: (suggestion: ICardSuggestion) => void;
    onClose: () => void;
}) {
    const [createSuggestion, { isLoading: isCreating }] = useCreateSuggestionMutation();
    const [saveDraftSuggestion, { isLoading: isUpdating }] = useSaveDraftSuggestionMutation();

    const onPress = async () => {
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
            showApiErrorToast(err);
        }
    };

    return (
        <Button variant="flat" onPress={onPress} isLoading={isCreating || isUpdating}>
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

// Trigger Reliability/Repeatability only mean anything once "triggered" is answered - shared by the
// manual toggle and the auto-tracking effect, so either route clears them the same way.
function applyAbilityTypes(
    prev: DeepPartial<ISuggestionQuestions> | undefined,
    abilityTypes: AbilityType[]
): DeepPartial<ISuggestionQuestions> {
    return {
        ...prev,
        abilityTypes,
        ...(!abilityTypes.includes("triggered") && {
            triggerReliability: [],
            repeatability: { hardLimit: false, paidCost: false, oneTime: false }
        })
    };
}

const EditSuggestionModal = ({
    isOpen,
    suggestion: initial,
    onClose: onModalClose = () => true,
    onSave = () => true
}: EditSuggestionModalProps) => {
    const { user } = useAuth();
    // Read via a ref inside the load effect below, so that effect can depend on `initial` alone -
    // `user` changing identity for unrelated reasons shouldn't re-run a "load this suggestion" effect.
    const userRef = useRef(user);
    userRef.current = user;
    const [createSuggestion, { isLoading: isCreating }] = useCreateSuggestionMutation();
    const [updateSuggestion, { isLoading: isSubmitting }] = useUpdateSuggestionMutation();
    const [suggestion, setSuggestion] = useState<DeepPartial<ICardSuggestion>>({});
    // The mobile rail's peek state - collapsed (icons only) is the resting state, expanded shows
    // the checklist + card. See the AnimatePresence block near the footer for the fade choreography.
    const [railExpanded, setRailExpanded] = useState(false);

    // A new suggestion is always your own (see the load effect's `initialIsNew`) - this only fires
    // for an existing one whose submitter isn't you (EDIT_SUGGESTIONS lets anyone amend anyone's).
    const isEditingOthersSuggestion = !!suggestion.id && !!user && suggestion.user?.discordId !== user.discordId;

    // Reward/punishment always open collapsed, even when already answered - the answer still shows
    // via `alwaysVisible`; opening is a deliberate "I want to change this" action.
    const [rewardsOpen, setRewardsOpen] = useState(false);
    const [punishmentOpen, setPunishmentOpen] = useState(false);
    const [comparableCardsOpen, setComparableCardsOpen] = useState(false);
    const [combosWithOpen, setCombosWithOpen] = useState(false);

    // Guards the ability-type auto-detect effect below against running on the load itself - starts
    // `true` so the very first mount is skipped too, not just a later re-open.
    const skipNextAbilityAutoDetect = useRef(true);

    useEffect(() => {
        // Whether THIS incoming `initial` is new - reading `suggestion` state instead (still last
        // render's value here) attributed every suggestion's first edit in a session to the editor.
        const initialIsNew = !initial?.id;
        const user = userRef.current;
        setSuggestion({
            ...initial,
            ...(initialIsNew && user && { user: { discordId: user.discordId, displayname: user.displayname } })
        });
        setRewardsOpen(false);
        setPunishmentOpen(false);
        skipNextAbilityAutoDetect.current = true;
    }, [initial]);

    // `derived` is kept live client-side too, mirroring the server's own recompute on save - lets
    // the checklist/validation work without waiting on a round trip.
    useEffect(() => {
        const derived = deriveFields(suggestion.card?.text ?? "");
        setSuggestion((prev) => ({ ...prev, derived }));
    }, [suggestion.card?.text]);

    // "Derived, not driven" (see CLAUDE.md) - resyncs on every text EDIT, but skipped on the load
    // itself (skipNextAbilityAutoDetect), or a saved answer the regex misses gets overwritten.
    useEffect(() => {
        if (skipNextAbilityAutoDetect.current) {
            skipNextAbilityAutoDetect.current = false;
            return;
        }
        const text = suggestion.card?.text ?? "";
        const triggered = hasTriggeredAbility(text);
        const passive = hasPassiveAbility(text);
        setSuggestion((prev) => {
            const current = prev.questions?.abilityTypes ?? [];
            const next: AbilityType[] = [
                ...(triggered ? (["triggered"] as const) : []),
                ...(passive ? (["passive"] as const) : [])
            ];
            if (next.length === current.length && next.every((t) => current.includes(t))) {
                return prev;
            }
            return { ...prev, questions: applyAbilityTypes(prev.questions, next) };
        });
    }, [suggestion.card?.text]);

    const onAbilityTypesChange = useCallback((next: AbilityType[]) => {
        setSuggestion((prev) => ({ ...prev, questions: applyAbilityTypes(prev.questions, next) }));
    }, []);

    const { card, questions, derived, pivotPoints } = suggestion;

    // checklistRules()/renderCardSuggestion() are real work (keyword scans, a layout pass), and
    // `card` gets a new identity on every keystroke - deferring lets typing paint first.
    const deferredCard = useDeferredValue(card);
    const deferredQuestions = useDeferredValue(questions);
    const deferredDerived = useDeferredValue(derived);
    const deferredPivotPoints = useDeferredValue(pivotPoints);

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
                abilityTypes: (deferredQuestions?.abilityTypes ?? []).filter((t): t is AbilityType => !!t),
                triggerReliability: deferredQuestions?.triggerReliability ?? [],
                repeatability: {
                    hardLimit: !!deferredQuestions?.repeatability?.hardLimit,
                    paidCost: !!deferredQuestions?.repeatability?.paidCost,
                    oneTime: !!deferredQuestions?.repeatability?.oneTime
                },
                iconic: deferredQuestions?.iconic
            },
            derived: (deferredDerived as IDerivedFields) ?? { triggerTypes: [], keywords: [] },
            pivotPoints: (deferredPivotPoints ?? []).filter((p): p is string => !!p)
        });
    }, [deferredCard, deferredQuestions, deferredDerived, deferredPivotPoints]);

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
    const onTriggerReliabilityChange = useCallback(
        (triggerReliability: TriggerReliability[]) =>
            setSuggestion((prev) => ({ ...prev, questions: { ...prev.questions, triggerReliability } })),
        []
    );
    const onRepeatabilityChange = useCallback(
        (repeatability: IRepeatability) =>
            setSuggestion((prev) => ({ ...prev, questions: { ...prev.questions, repeatability } })),
        []
    );
    // A fresh literal every render would defeat RepeatabilityTiles' own memoization just as surely
    // as an unstable callback - same reasoning as EMPTY_STRINGS above, just recomputed not static.
    const repeatabilityValue = useMemo(
        () => ({
            hardLimit: !!suggestion.questions?.repeatability?.hardLimit,
            paidCost: !!suggestion.questions?.repeatability?.paidCost,
            oneTime: !!suggestion.questions?.repeatability?.oneTime
        }),
        [
            suggestion.questions?.repeatability?.hardLimit,
            suggestion.questions?.repeatability?.paidCost,
            suggestion.questions?.repeatability?.oneTime
        ]
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
            onModalClose();
        } catch (err) {
            if (!isValidationError(err)) {
                showApiErrorToast(err);
            }
        }
    };

    // Stable for the same reason as pivotPointsValue/repeatabilityValue above - AbilityTypeToggle is memoized.
    const abilityTypeValues = useMemo(
        () => (suggestion.questions?.abilityTypes ?? []).filter((t): t is AbilityType => !!t),
        [suggestion.questions?.abilityTypes]
    );
    const hasTriggered = abilityTypeValues.includes("triggered");

    // What the text itself currently implies, regardless of what's answered - drives the "auto-detected"
    // badge on AbilityTypeToggle, independent of whether that answer came from a manual override.
    const autoDetectedAbilityTypes = useMemo(() => {
        const text = suggestion.card?.text ?? "";
        return [
            ...(hasTriggeredAbility(text) ? (["triggered"] as const) : []),
            ...(hasPassiveAbility(text) ? (["passive"] as const) : [])
        ] as AbilityType[];
    }, [suggestion.card?.text]);

    // CardPreview is itself memoized - a fresh object here would defeat that, forcing a full relayout
    // on every unrelated keystroke. Reads off `deferredCard` for the same reason as checklistResults.
    const renderedCard = useMemo(
        () => renderCardSuggestion({ card: deferredCard, id: suggestion.id, user: suggestion.user }),
        [deferredCard, suggestion.id, suggestion.user]
    );

    return (
        <Modal
            isOpen={isOpen}
            placement="top-center"
            onOpenChange={(isOpen) => !isOpen && onModalClose()}
            size="5xl"
            scrollBehavior="inside"
        >
            <ModalContent>
                {(onClose) => (
                    <Wizard schema={CardSuggestion.Full} onSubmit={onSubmit} data={suggestion}>
                        <ModalHeader>Card Suggestion Editor</ModalHeader>
                        {/* Wraps the body so the mobile reveal panel below can position against this box
                            exactly, covering it rather than pushing content below. */}
                        <div className="relative flex-1 min-h-0 flex flex-col">
                            {/* `overflow-hidden`, not the scrollable body default - scrolling is handled
                            by the two columns below instead, so this just stays clipped to its own height. */}
                            <ModalBody className="flex-1 min-h-0 overflow-hidden">
                                <ValidationSummary />
                                {/* Same idea as amending a review on someone's behalf, but a proper
                                    StatusNotice, matching every other non-modal notice in the app. */}
                                {isEditingOthersSuggestion && (
                                    <StatusNotice
                                        icon={faUserPen}
                                        color="info"
                                        label="Editing Another User's Suggestion"
                                        detail={
                                            <span className="inline-flex flex-wrap items-center gap-1.5">
                                                You are amending
                                                <UserRow
                                                    discordId={suggestion.user!.discordId!}
                                                    className="inline-flex w-auto"
                                                    trailing="'s suggestion on their behalf."
                                                />
                                            </span>
                                        }
                                        className="mb-2 shrink-0"
                                    />
                                )}
                                {/* `flex-1 min-h-0` unconditionally, not just `md:` - left at `md:` only,
                                this row sized to its content on mobile, taller than ModalBody's own box. */}
                                <div className="flex flex-1 min-h-0 flex-col md:flex-row gap-2">
                                    {/* Left column: the wizard's own pages, scrolling as a whole - the ONLY
                                    thing that scrolls on desktop, and (right rail `hidden` below `md`) on mobile too. */}
                                    <div className="flex-1 min-w-0 min-h-0 overflow-y-auto md:pr-2">
                                        <WizardPages>
                                            <WizardPage
                                                controlledData={{ card: getBaseCardValues(suggestion.card ?? {}) }}
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
                                                        abilityTypes: suggestion.questions?.abilityTypes ?? [],
                                                        triggerReliability:
                                                            suggestion.questions?.triggerReliability ?? [],
                                                        repeatability: suggestion.questions?.repeatability,
                                                        iconic: suggestion.questions?.iconic,
                                                        rewardTypes: suggestion.questions?.rewardTypes ?? [],
                                                        punishment: suggestion.questions?.punishment ?? []
                                                    }
                                                }}
                                            >
                                                <div className="flex flex-col gap-5 w-full">
                                                    <div className="flex flex-col gap-2 w-full">
                                                        <SectionTitle size="sm">
                                                            Iconic Weight
                                                            <RequiredMark />
                                                        </SectionTitle>
                                                        <SectionBlurb>
                                                            {SUGGESTION_SECTION_DESCRIPTIONS.iconic}
                                                        </SectionBlurb>
                                                        <RequiredField name="questions.iconic">
                                                            <IconicSwitch
                                                                value={suggestion.questions?.iconic}
                                                                onChange={onIconicChange}
                                                            />
                                                        </RequiredField>
                                                    </div>

                                                    <div className="flex flex-col gap-4 w-full rounded-lg border border-content3 p-3">
                                                        <div className="flex flex-col gap-2 w-full">
                                                            <SectionTitle size="sm">Ability Types</SectionTitle>
                                                            <SectionBlurb>
                                                                {SUGGESTION_SECTION_DESCRIPTIONS.abilityTypes}
                                                            </SectionBlurb>
                                                            <AbilityTypeToggle
                                                                value={abilityTypeValues}
                                                                onChange={onAbilityTypesChange}
                                                                autoDetected={autoDetectedAbilityTypes}
                                                            />
                                                        </div>

                                                        <AnimatePresence initial={false}>
                                                            {hasTriggered && (
                                                                <motion.div
                                                                    key="trigger-details"
                                                                    initial={{ height: 0, opacity: 0 }}
                                                                    animate={{ height: "auto", opacity: 1 }}
                                                                    exit={{ height: 0, opacity: 0 }}
                                                                    transition={RAIL_TRANSITION}
                                                                    className="overflow-hidden"
                                                                >
                                                                    <div className="flex flex-col gap-4">
                                                                        <div className="flex flex-col gap-2 w-full">
                                                                            <SubTitle>Trigger Reliability</SubTitle>
                                                                            <SectionBlurb>
                                                                                {
                                                                                    SUGGESTION_SECTION_DESCRIPTIONS.triggerReliability
                                                                                }
                                                                            </SectionBlurb>
                                                                            <TriggerReliabilityCards
                                                                                value={
                                                                                    suggestion.questions
                                                                                        ?.triggerReliability ??
                                                                                    EMPTY_TRIGGER_RELIABILITY
                                                                                }
                                                                                onChange={onTriggerReliabilityChange}
                                                                            />
                                                                        </div>
                                                                        <div className="flex flex-col gap-2 w-full">
                                                                            <SubTitle>Trigger Repeatability</SubTitle>
                                                                            <SectionBlurb>
                                                                                {
                                                                                    SUGGESTION_SECTION_DESCRIPTIONS.triggerRepeatability
                                                                                }
                                                                            </SectionBlurb>
                                                                            <RepeatabilityTiles
                                                                                value={repeatabilityValue}
                                                                                onChange={onRepeatabilityChange}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>

                                                    <CollapsibleQuestion
                                                        title="Rewards"
                                                        blurb={SUGGESTION_SECTION_DESCRIPTIONS.rewardTypes}
                                                        isOpen={rewardsOpen}
                                                        onOpenChange={setRewardsOpen}
                                                        alwaysVisible={
                                                            <SelectedTagChips
                                                                options={REWARD_TYPES}
                                                                value={
                                                                    suggestion.questions?.rewardTypes ?? EMPTY_STRINGS
                                                                }
                                                                onChange={onRewardTypesChange}
                                                                isDisabled={!rewardsOpen}
                                                                emptyLabel="No rewards selected."
                                                            />
                                                        }
                                                    >
                                                        <SearchTagPicker
                                                            options={REWARD_TYPES}
                                                            value={suggestion.questions?.rewardTypes ?? EMPTY_STRINGS}
                                                            onChange={onRewardTypesChange}
                                                            showChips={false}
                                                            placeholder="Search reward types by name or category…"
                                                        />
                                                    </CollapsibleQuestion>

                                                    <CollapsibleQuestion
                                                        title="Punishment"
                                                        blurb={SUGGESTION_SECTION_DESCRIPTIONS.punishment}
                                                        isOpen={punishmentOpen}
                                                        onOpenChange={setPunishmentOpen}
                                                        alwaysVisible={
                                                            <SelectedTagChips
                                                                options={PUNISHMENT_TYPES}
                                                                value={
                                                                    suggestion.questions?.punishment ?? EMPTY_STRINGS
                                                                }
                                                                onChange={onPunishmentChange}
                                                                isDisabled={!punishmentOpen}
                                                                emptyLabel="No punishment selected."
                                                            />
                                                        }
                                                    >
                                                        <SearchTagPicker
                                                            options={PUNISHMENT_TYPES}
                                                            value={suggestion.questions?.punishment ?? EMPTY_STRINGS}
                                                            onChange={onPunishmentChange}
                                                            showChips={false}
                                                            placeholder="Search punishment types…"
                                                        />
                                                    </CollapsibleQuestion>
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
                                                        <SectionTitle size="sm">Pivot Points</SectionTitle>
                                                        <SectionBlurb>
                                                            {SUGGESTION_SECTION_DESCRIPTIONS.pivotPoints}
                                                        </SectionBlurb>
                                                        <PivotPointsInput
                                                            className="w-full"
                                                            value={pivotPointsValue}
                                                            onChange={onPivotPointsChange}
                                                        />
                                                    </div>
                                                    <CollapsibleQuestion
                                                        title="Comparable Cards"
                                                        blurb={SUGGESTION_SECTION_DESCRIPTIONS.comparableCards}
                                                        isOpen={comparableCardsOpen}
                                                        onOpenChange={setComparableCardsOpen}
                                                        alwaysVisible={
                                                            <SelectedCardChips
                                                                value={comparableCardsValue}
                                                                onChange={onComparableCardsChange}
                                                                isDisabled={!comparableCardsOpen}
                                                                emptyLabel="No comparable cards selected."
                                                            />
                                                        }
                                                    >
                                                        <CardMultiSelect
                                                            className="w-full"
                                                            ariaLabel="Comparable Cards"
                                                            placeholder="Search printed cards…"
                                                            value={comparableCardsValue}
                                                            onChange={onComparableCardsChange}
                                                        />
                                                    </CollapsibleQuestion>
                                                    <CollapsibleQuestion
                                                        title="Combos With"
                                                        blurb={SUGGESTION_SECTION_DESCRIPTIONS.combosWith}
                                                        isOpen={combosWithOpen}
                                                        onOpenChange={setCombosWithOpen}
                                                        alwaysVisible={
                                                            <SelectedCardChips
                                                                value={combosWithValue}
                                                                onChange={onCombosWithChange}
                                                                isDisabled={!combosWithOpen}
                                                                emptyLabel="No combos selected."
                                                            />
                                                        }
                                                    >
                                                        <CardMultiSelect
                                                            className="w-full"
                                                            ariaLabel="Combos With"
                                                            placeholder="Search printed cards…"
                                                            value={combosWithValue}
                                                            onChange={onCombosWithChange}
                                                        />
                                                    </CollapsibleQuestion>
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
                                                        <SectionTitle size="sm">Checklist Review</SectionTitle>
                                                        <SectionBlurb>
                                                            {SUGGESTION_SECTION_DESCRIPTIONS.checklistReview}
                                                        </SectionBlurb>
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
                                                        <SectionTitle size="sm">Editor Notes</SectionTitle>
                                                        <SectionBlurb>
                                                            {SUGGESTION_SECTION_DESCRIPTIONS.editorNotes}
                                                        </SectionBlurb>
                                                        <Textarea
                                                            value={suggestion.notes ?? ""}
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
                                    <div className="hidden md:flex md:w-72 md:shrink-0 md:min-h-0 md:flex-col gap-3">
                                        <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto">
                                            <div>
                                                <CardPreview card={renderedCard} orientation="vertical" rounded />
                                            </div>
                                            <ChecklistRail results={checklistResults} suggestion={suggestion} />
                                        </div>
                                        <div className="shrink-0 flex items-center justify-end gap-2 border-t border-content3 pt-3">
                                            <DesktopEngagementClearIcon suggestion={suggestion} />
                                            <WizardBack onCancel={onClose} />
                                            {suggestion.draft !== false && (
                                                <SaveDraftButton
                                                    suggestionId={suggestion.id}
                                                    data={suggestion}
                                                    onSaved={setSuggestion}
                                                    onClose={onModalClose}
                                                />
                                            )}
                                            <WizardNext isLoading={isCreating || isSubmitting} color="primary" />
                                        </div>
                                    </div>
                                </div>
                            </ModalBody>

                            {/* Mobile reveal: an overlay covering the body exactly (not content pushed
                                below it) - collapsing removes it and the body's own scroll is back. */}
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
                                            {/* CardPreview has no "fit available height" mode - this
                                            aspect-ratio div gives it a correctly-sized box, height-first. */}
                                            <div className="flex-1 min-h-0 flex items-center justify-center">
                                                <div className="h-full max-w-full" style={{ aspectRatio: "240 / 333" }}>
                                                    <CardPreview
                                                        card={renderedCard}
                                                        orientation="vertical"
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

                        {/* Collapsed resting state - a slim always-visible bar below the body, outside
                            the relative wrapper above so it never gets covered by the overlay itself. */}
                        {!railExpanded && (
                            <MobileChecklistBar results={checklistResults} onExpand={() => setRailExpanded(true)} />
                        )}

                        {/* Desktop has its own copy inside the sticky rail - mobile has no rail for the
                        full last-page message to move into, so it just keeps showing the icon. */}
                        <ModalFooter className="md:hidden">
                            <EngagementClearIcon suggestion={suggestion} />
                            <WizardBack onCancel={onClose} />
                            {suggestion.draft !== false && (
                                <SaveDraftButton
                                    suggestionId={suggestion.id}
                                    data={suggestion}
                                    onSaved={setSuggestion}
                                    onClose={onModalClose}
                                />
                            )}
                            <WizardNext isLoading={isCreating || isSubmitting} color="primary" />
                        </ModalFooter>
                    </Wizard>
                )}
            </ModalContent>
        </Modal>
    );
};

type EditSuggestionModalProps = Omit<BaseElementProps, "children"> & {
    isOpen: boolean;
    suggestion?: DeepPartial<ICardSuggestion>;
    onClose?: () => void;
    onSave?: (suggestion: ICardSuggestion) => void;
};

export default EditSuggestionModal;
