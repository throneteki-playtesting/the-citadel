import { memo, ReactNode } from "react";
import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { ChecklistJustifications, ChecklistRuleId, GameModeType } from "common/models/cards";
import { IRewardDownsideOption } from "common/models/settings";
import { DeepPartial } from "common/types";
import { RuleResult } from "common/designGuidelines/checklistRules";
import { SUGGESTION_QUESTIONS, SuggestionQuestionMeta } from "common/designGuidelines/suggestionQuestions";
import { RAIL_TRANSITION } from "./editorTransition";
import { useWizard } from "../../components/wizard/context";
import RichTextArea from "../../components/richTextArea";
import CardPickerDropdown from "../../components/data/cardPickerDropdown";
import SelectedCardImages from "../../components/data/selectedCardImages";
import SearchTagPicker from "../../components/designGuidelines/searchTagPicker";
import MultiTileGroup from "../../components/designGuidelines/multiTileGroup";
import PivotPointsInput from "../../components/designGuidelines/pivotPointsInput";
import BooleanTileGroup from "../../components/designGuidelines/booleanTileGroup";
import CountStepper from "../../components/designGuidelines/countStepper";
import QuestionHelpIcon from "../../components/designGuidelines/questionHelpIcon";
import { FullChecklist } from "../../components/designGuidelines/suggestionChecklist";
import SectionTitle from "../../components/sectionTitle";
import SectionBlurb from "../../components/sectionBlurb";

// Every page is mounted at once, so each is given only its own answers to keep card edits from re-rendering it

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

export const QuestionsPage = memo(function QuestionsPage({
    iconic,
    intendedGameModes,
    triggeredAbilityCount,
    naturalTrigger,
    repeatabilityRestricted,
    onIconicChange,
    onIntendedGameModesChange,
    onTriggeredAbilityCountChange,
    onNaturalTriggerChange,
    onRepeatabilityRestrictedChange
}: {
    iconic?: boolean;
    intendedGameModes: GameModeType[];
    triggeredAbilityCount?: number;
    naturalTrigger?: boolean;
    repeatabilityRestricted?: boolean;
    onIconicChange: (iconic: boolean) => void;
    onIntendedGameModesChange: (modes: GameModeType[]) => void;
    onTriggeredAbilityCountChange: (count: number) => void;
    onNaturalTriggerChange: (naturalTrigger: boolean) => void;
    onRepeatabilityRestrictedChange: (repeatabilityRestricted: boolean) => void;
}) {
    // Natural Trigger/Safely Limited only mean anything once there's a triggered ability to ask
    // about - gates their visibility, matching the `required()` conditional in the submit-time schema.
    const hasTriggeredAbilities = (triggeredAbilityCount ?? 0) > 0;

    return (
        <div className="flex flex-col gap-5 w-full">
            <div className="flex flex-col gap-2 w-full">
                <QuestionHeader question={SUGGESTION_QUESTIONS.iconic} required />
                <RequiredField name="questions.iconic">
                    <BooleanTileGroup
                        options={SUGGESTION_QUESTIONS.iconic.options!}
                        value={iconic}
                        onChange={onIconicChange}
                    />
                </RequiredField>
            </div>

            <div className="flex flex-col gap-2 w-full">
                <QuestionHeader question={SUGGESTION_QUESTIONS.intendedGameModes} required />
                <RequiredField name="questions.intendedGameModes">
                    <MultiTileGroup
                        options={SUGGESTION_QUESTIONS.intendedGameModes.gameModes!}
                        value={intendedGameModes}
                        onChange={onIntendedGameModesChange}
                    />
                </RequiredField>
            </div>

            <div className="flex flex-col gap-2 w-full">
                <SectionTitle size="sm">{SUGGESTION_QUESTIONS.triggeredAbilityCount.title}</SectionTitle>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <SectionBlurb className="flex-1 min-w-0">
                        {SUGGESTION_QUESTIONS.triggeredAbilityCount.question}
                        <QuestionHelpIcon question={SUGGESTION_QUESTIONS.triggeredAbilityCount} />
                    </SectionBlurb>
                    <CountStepper
                        className="shrink-0"
                        value={triggeredAbilityCount}
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
                                <QuestionHeader question={SUGGESTION_QUESTIONS.naturalTrigger} required />
                                <RequiredField name="questions.naturalTrigger">
                                    <BooleanTileGroup
                                        options={SUGGESTION_QUESTIONS.naturalTrigger.options!}
                                        value={naturalTrigger}
                                        onChange={onNaturalTriggerChange}
                                    />
                                </RequiredField>
                            </div>

                            <div className="flex flex-col gap-2 w-full">
                                <QuestionHeader question={SUGGESTION_QUESTIONS.repeatabilityRestricted} required />
                                <RequiredField name="questions.repeatabilityRestricted">
                                    <BooleanTileGroup
                                        options={SUGGESTION_QUESTIONS.repeatabilityRestricted.options!}
                                        value={repeatabilityRestricted}
                                        onChange={onRepeatabilityRestrictedChange}
                                    />
                                </RequiredField>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});

export const RewardsPage = memo(function RewardsPage({
    rewards,
    downsides,
    rewardOptions,
    downsideOptions,
    marks,
    onRewardsChange,
    onDownsidesChange
}: {
    rewards: string[];
    downsides: string[];
    rewardOptions: IRewardDownsideOption[];
    downsideOptions: IRewardDownsideOption[];
    marks: Record<string, string[]>;
    onRewardsChange: (rewards: string[]) => void;
    onDownsidesChange: (downsides: string[]) => void;
}) {
    return (
        <div className="flex flex-col gap-5 w-full">
            <div className="flex flex-col gap-2 w-full">
                <QuestionHeader question={SUGGESTION_QUESTIONS.rewards} />
                <SearchTagPicker
                    options={rewardOptions}
                    value={rewards}
                    onChange={onRewardsChange}
                    aspectKind="aspect"
                    marks={marks}
                    placeholder="Search reward types by name or tag…"
                />
            </div>

            <div className="flex flex-col gap-2 w-full">
                <QuestionHeader question={SUGGESTION_QUESTIONS.downsides} />
                <SearchTagPicker
                    options={downsideOptions}
                    value={downsides}
                    onChange={onDownsidesChange}
                    aspectKind="drawback"
                    marks={marks}
                    placeholder="Search downside types by name or tag…"
                />
            </div>
        </div>
    );
});

export const ContextPage = memo(function ContextPage({
    pivotPoints,
    comparableCards,
    combosWith,
    onPivotPointsChange,
    onComparableCardsChange,
    onCombosWithChange
}: {
    pivotPoints: string[];
    comparableCards: string[];
    combosWith: string[];
    onPivotPointsChange: (pivotPoints: string[]) => void;
    onComparableCardsChange: (cards: string[]) => void;
    onCombosWithChange: (cards: string[]) => void;
}) {
    return (
        <div className="flex flex-col gap-5 w-full">
            <div className="flex flex-col gap-2 w-full">
                <QuestionHeader question={SUGGESTION_QUESTIONS.pivotPoints} />
                <PivotPointsInput className="w-full" value={pivotPoints} onChange={onPivotPointsChange} />
            </div>
            <div className="flex flex-col gap-2 w-full">
                <QuestionHeader question={SUGGESTION_QUESTIONS.comparableCards} />
                <SelectedCardImages
                    value={comparableCards}
                    onChange={onComparableCardsChange}
                    emptyLabel="No comparable cards selected."
                />
                <CardPickerDropdown
                    ariaLabel="Search comparable cards"
                    placeholder="Search by name or trait…"
                    value={comparableCards}
                    onChange={onComparableCardsChange}
                />
            </div>
            <div className="flex flex-col gap-2 w-full">
                <QuestionHeader question={SUGGESTION_QUESTIONS.combosWith} />
                <SelectedCardImages value={combosWith} onChange={onCombosWithChange} emptyLabel="No combos selected." />
                <CardPickerDropdown
                    ariaLabel="Search combo cards"
                    placeholder="Search by name or trait…"
                    value={combosWith}
                    onChange={onCombosWithChange}
                />
            </div>
        </div>
    );
});

export const ReviewPage = memo(function ReviewPage({
    results,
    justifications,
    notes,
    onJustificationChange,
    onNotesChange
}: {
    results: RuleResult[];
    justifications: DeepPartial<ChecklistJustifications>;
    notes?: string;
    onJustificationChange: (rule: ChecklistRuleId, justification: string) => void;
    onNotesChange: (notes: string | undefined) => void;
}) {
    return (
        <div className="flex flex-col gap-5 w-full">
            <div className="flex flex-col gap-2 w-full">
                <QuestionHeader question={SUGGESTION_QUESTIONS.checklistReview} />
                <FullChecklist
                    results={results}
                    justifications={justifications}
                    onJustificationChange={onJustificationChange}
                />
            </div>
            <div className="flex flex-col gap-2 w-full">
                <QuestionHeader question={SUGGESTION_QUESTIONS.editorNotes} />
                <RichTextArea
                    value={notes}
                    onValueChange={onNotesChange}
                    placeholder="E.g. Intended as a soft counter to control decks..."
                />
            </div>
        </div>
    );
});
