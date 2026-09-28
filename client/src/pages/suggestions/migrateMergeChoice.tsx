import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCodeMerge, faThumbsUp, faXmark } from "@fortawesome/free-solid-svg-icons";
import { countReactionsByType, ICardSuggestion } from "common/models/cards";
import SectionTitle from "../../components/sectionTitle";
import SectionBlurb from "../../components/sectionBlurb";
import StatusNotice from "../../components/statusNotice";
import SuggestionCardPreview from "../../components/suggestionCardPreview";

/** The migrate wizard's first page, shown only when the thread looks like one of the designer's own legacy
 *  suggestions - at most one of which can be merged into the suggestion the thread becomes */
export default function MigrateMergeChoice({ candidates, value, onChange }: MigrateMergeChoiceProps) {
    const isSeveral = candidates.length > 1;

    return (
        <div className="flex flex-col gap-4 w-full">
            <div className="flex flex-col gap-2">
                <SectionTitle size="sm">Merge a legacy suggestion?</SectionTitle>
                <SectionBlurb>
                    {isSeveral
                        ? "These legacy suggestions of yours look like the card in this thread. Pick the one it is, if any."
                        : "This legacy suggestion of yours looks like the card in this thread. Is it the same card?"}
                </SectionBlurb>
            </div>
            <StatusNotice
                icon={faCodeMerge}
                color="warning"
                label="Merging"
                detail={
                    "The merged suggestion is deleted, and its likes move to this one - only one suggestion will " +
                    "remain, dated from when the Discord thread was started." +
                    (isSeveral ? " You can always delete the others yourself afterwards." : "")
                }
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" role="radiogroup">
                {candidates.map((candidate) => {
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
                                "flex flex-col gap-1.5 rounded-lg p-1.5 text-left transition-colors cursor-pointer",
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
                            <div className="flex items-center justify-between gap-2 px-0.5 text-xs text-foreground/60">
                                <span className="truncate">{candidate.card.name}</span>
                                <span className="shrink-0">
                                    <FontAwesomeIcon icon={faThumbsUp} /> {likes}
                                </span>
                            </div>
                        </button>
                    );
                })}
                <button
                    type="button"
                    role="radio"
                    aria-checked={!value}
                    onClick={() => onChange(undefined)}
                    className={classNames(
                        "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-sm transition-colors cursor-pointer min-h-32",
                        !value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-content3 text-foreground/60 hover:bg-content2"
                    )}
                >
                    <FontAwesomeIcon icon={faXmark} className="text-xl" />
                    Don't merge
                </button>
            </div>
        </div>
    );
}

type MigrateMergeChoiceProps = {
    candidates: ICardSuggestion[];
    value?: string;
    onChange: (mergeId?: string) => void;
};
