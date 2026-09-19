import { SuggestionQuestionMeta } from "common/designGuidelines/suggestionQuestions";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { TouchTooltip } from "../touchTooltip";

/** Title, then intent, then examples set off behind their own "Examples" label - so a reader can
 *  tell at a glance which lines are explanation and which are concrete instances. */
function QuestionHelpTooltip({ question }: { question: SuggestionQuestionMeta }) {
    return (
        <div className="flex max-w-96 flex-col gap-2.5 p-1">
            <div className="text-sm font-semibold text-foreground/90">{question.title}</div>
            {question.intent && <div className="text-xs leading-relaxed text-foreground/80">{question.intent}</div>}
            {question.examples && question.examples.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-md bg-content2 p-2">
                    <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground/50">
                        Examples
                    </div>
                    <ul className="flex flex-col gap-1 pl-3.5 text-xs leading-relaxed text-foreground/70">
                        {question.examples.map((example) => (
                            <li key={example} className="list-disc">
                                {example}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

/** An info icon riding the end of a question's blurb - an inline child of the same text, not a
 *  layout sibling, so it wraps with it rather than pinning to the row's far edge. */
export default function QuestionHelpIcon({ question }: { question: SuggestionQuestionMeta }) {
    return (
        <TouchTooltip content={<QuestionHelpTooltip question={question} />}>
            <span className="ml-1 inline-flex translate-y-0.5 cursor-help text-primary/70 hover:text-primary">
                <FontAwesomeIcon icon={faCircleQuestion} className="text-sm" />
            </span>
        </TouchTooltip>
    );
}
