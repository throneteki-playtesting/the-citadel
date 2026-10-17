import { useMemo } from "react";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faClock, faCodeMerge, faThumbsUp, faTrash, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { countReactionsByType, ICardSuggestion } from "common/models/cards";
import SectionTitle from "../../components/sectionTitle";
import SectionBlurb from "../../components/sectionBlurb";
import SuggestionCardPreview from "../../components/suggestionCardPreview";
import Timestamp from "../../components/timestamp";

type Point = { icon: IconDefinition; text: string };

function Radio({ isSelected }: { isSelected: boolean }) {
    return (
        <span
            className={classNames(
                "shrink-0 grid place-items-center size-5 rounded-full border-2 transition-colors",
                isSelected ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30"
            )}
        >
            {isSelected && <FontAwesomeIcon icon={faCheck} className="text-[0.6rem]" />}
        </span>
    );
}

/** The migrate wizard's first page, shown only when the thread looks like one of the designer's own legacy
 *  suggestions - at most one of which can be merged into the suggestion the thread becomes */
export default function MigrateMergeChoice({ candidates, value, onChange }: MigrateMergeChoiceProps) {
    const isSeveral = candidates.length > 1;
    const newestFirst = useMemo(
        () => [...candidates].sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()),
        [candidates]
    );

    const points: Point[] = [
        {
            icon: faCodeMerge,
            text: isSeveral
                ? "Only the one you choose is merged - the others are left as they are."
                : "If it is the same card, it is merged into this thread's suggestion."
        },
        { icon: faTrash, text: "The merged legacy suggestion is deleted." },
        { icon: faThumbsUp, text: "Its likes and dislikes move across." },
        { icon: faClock, text: "The result is dated from when the thread started." }
    ];

    return (
        <div className="flex flex-col gap-4 w-full">
            <div className="flex flex-col gap-2">
                <SectionTitle size="sm">
                    {isSeveral
                        ? "Is this card one of your legacy suggestions?"
                        : "Is this card your legacy suggestion?"}
                </SectionTitle>
                <SectionBlurb>
                    {isSeveral
                        ? "These legacy suggestions of yours look like the card in this thread."
                        : "This legacy suggestion of yours looks like the card in this thread."}
                </SectionBlurb>
            </div>
            <ul className="flex flex-col gap-1.5">
                {points.map(({ icon, text }) => (
                    <li key={text} className="flex items-start gap-2.5 text-sm text-foreground/70">
                        <FontAwesomeIcon icon={icon} className="shrink-0 mt-0.5 w-4 text-foreground/40" />
                        <span>{text}</span>
                    </li>
                ))}
            </ul>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="radiogroup">
                {newestFirst.map((candidate) => {
                    const isSelected = value === candidate.id;
                    const isPlot = candidate.card.type === "plot";
                    const likes = countReactionsByType(candidate._metadata?.engagement?.reactions, "like");
                    return (
                        <button
                            key={candidate.id}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            onClick={() => onChange(isSelected ? undefined : candidate.id)}
                            className={classNames(
                                "flex flex-col gap-1.5 min-w-0 rounded-lg p-1.5 text-left transition-colors cursor-pointer",
                                isSelected ? "bg-primary/15 ring-2 ring-primary" : "hover:bg-content2"
                            )}
                        >
                            <div className={classNames("w-full", isPlot ? "aspect-[333/240]" : "aspect-[240/333]")}>
                                <SuggestionCardPreview
                                    suggestion={candidate}
                                    orientation={isPlot ? "horizontal" : "vertical"}
                                    rounded
                                />
                            </div>
                            <div className="flex items-center justify-between gap-2 px-0.5 text-xs text-foreground/70">
                                <Radio isSelected={isSelected} />
                                <Timestamp
                                    date={candidate.created}
                                    variant="long"
                                    className="flex-1 min-w-0 truncate"
                                />
                                <span className="shrink-0">
                                    <FontAwesomeIcon icon={faThumbsUp} /> {likes}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
            <button
                type="button"
                role="radio"
                aria-checked={!value}
                onClick={() => onChange(undefined)}
                className={classNames(
                    "flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors cursor-pointer",
                    !value ? "border-primary bg-primary/10" : "border-content3 hover:bg-content2"
                )}
            >
                <Radio isSelected={!value} />
                <span className="flex flex-col">
                    <span className="text-sm font-semibold">
                        {isSeveral ? "None of these - don't merge" : "No - don't merge"}
                    </span>
                    <span className="text-xs text-foreground/60">
                        {isSeveral
                            ? "This thread becomes a new suggestion, and every legacy suggestion stays as it is."
                            : "This thread becomes a new suggestion, and the legacy suggestion stays as it is."}
                    </span>
                </span>
            </button>
        </div>
    );
}

type MigrateMergeChoiceProps = {
    candidates: ICardSuggestion[];
    value?: string;
    onChange: (mergeId?: string) => void;
};
