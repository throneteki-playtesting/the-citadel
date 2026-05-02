import { hasPermission } from "common/utils";
import { useGetCardsQuery, useGetReviewsQuery, useGetSuggestionsQuery, useGetUserQuery } from "../../api";
import { RootState } from "../../api/store";
import { useSelector } from "react-redux";
import Permission from "common/models/permissions";
import { Link } from "react-router-dom";
import { useMemo } from "react";
import { Faction, ICardSuggestion } from "common/models/cards";
import { IPlaytestReview, StatementAnswer, Statements } from "common/models/reviews";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFeatherPointed, faListCheck, faThumbsUp } from "@fortawesome/free-solid-svg-icons";
import { Avatar } from "@heroui/react";
import ThronesIcon from "../../components/thronesIcon";
import classNames from "classnames";
import Timestamp from "../../components/timestamp";

type Submission = { key: string, type: "suggestion" } & ICardSuggestion | { key: string, type: "review" } & IPlaytestReview;
export default function RecentSubmissions() {
    const user = useSelector((state: RootState) => state.auth.user);
    const { data: reviewData, isLoading: isLoadingReviews } = useGetReviewsQuery({ orderBy: { updated: "desc" }, page: 1, perPage: 10 });
    const { data: suggestionData, isLoading: isLoadingSuggestions } = useGetSuggestionsQuery({ orderBy: { updated: "desc" }, page: 1, perPage: 10 }, { skip: !hasPermission(user, Permission.READ_SUGGESTIONS) });

    const submissions = useMemo(() => {
        const reviews = reviewData?.items;
        const suggestions = suggestionData?.items;
        if (reviews && suggestions) {
            return [
                ...reviews.map((r) => ({ key: `${r.project}|${r.number}|${r.version}|${r.reviewer}`, type: "review", ...r }) as Submission),
                ...suggestions.map((s) => ({ key: s.id, type: "suggestion", ...s }) as Submission)
            ].sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()).slice(0, 10);
        }
    }, [reviewData?.items, suggestionData?.items]);

    // TODO Skeleton

    return (
        <div className="space-y-2">
            <div className="text-xs tracking-widest text-foreground/50 uppercase">Recent Submissions</div>
            <div className="border border-content3 divide-y divide-content3">
                {submissions?.map((submission) => (
                    <SubmissionRow key={submission.key} submission={submission} />
                ))}
            </div>
        </div>
    );
}

function SubmissionRow({ submission }: SubmissionRowProps) {
    switch (submission.type) {
        case "review":
            return <ReviewRow review={submission}/>;
        case "suggestion":
            return <SuggestionRow suggestion={submission}/>;
    }
}
type SubmissionRowProps = { submission: Submission };

function ReviewRow({ review }: ReviewRowProps) {
    const { data: user, isLoading: isLoadingUser } = useGetUserQuery({ discordId: review.reviewer });
    const { data: cardData, isLoading: isLoadingCard } = useGetCardsQuery({ filter: { project: review.project, number: review.number, version: review.version } });
    const card = useMemo(() => cardData?.items[0], [cardData?.items]);

    if (!user || !card) {
        return null;
    }
    // TODO: Skeleton
    return (
        <div className="relative overflow-hidden bg-content1 hover:bg-content3">
            <Link to={`/project/${review.project}/${review.number}`}>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                    <FontAwesomeIcon icon={faListCheck} className={classNames("ml-32 text-7xl", backgroundClasses[card.faction])}/>
                </div>
                <div className="relative z-10 px-4 py-2">
                    <div className="min-w-0 space-y-0.5">
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                            <div className="text-md font-semibold text-foreground truncate">{card.name} <span className="opacity-50">{card.version}</span></div>
                            <Timestamp className="my-auto text-xs italic text-foreground/40" date={new Date(review.updated)} isEdited={new Date(review.updated) > new Date(review.created)}/>
                        </div>
                        <div className="flex gap-2">
                            <Avatar src={user.avatarUrl} name={user.displayname} className="shrink-0 size-10 sm:size-8 md:size-10"/>
                            <div className="flex flex-col gap-1 min-w-0">
                                <div className="text-xs italic text-foreground/40">
                                    Review by {user.displayname}
                                </div>
                                <StatementBars statements={review.statements} />
                                <div className="text-xxs italic truncate text-foreground/40">
                                    {review.played} {review.played !== 1 ? "games" : "game"} played
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Link>
        </div>
    );
}
type ReviewRowProps = { review: IPlaytestReview };

function StatementBars({ statements }: { statements: Statements }) {
    const values = Object.values(statements);
    return (
        <div className="flex m-0 gap-1">
            {values.map((score, i) => (
                <div
                    key={i}
                    className={classNames("h-1 w-5 bg-disagree", scoreBarClass[score])}
                />
            ))}
        </div>
    );
}
const scoreBarClass: Record<StatementAnswer, string> = {
    "strongly disagree": "bg-statement-1",
    "somewhat disagree": "bg-statement-2",
    "neither agree nor disagree": "bg-statement-3",
    "somewhat agree": "bg-statement-4",
    "strongly agree": "bg-statement-5"
};

const backgroundClasses: Record<Faction, string> = {
    baratheon: "text-baratheon opacity-30",
    greyjoy: "text-greyjoy opacity-30",
    lannister: "text-lannister opacity-30",
    martell: "text-martell opacity-30",
    thenightswatch: "text-thenightswatch opacity-30",
    stark: "text-stark opacity-20",
    targaryen: "text-targaryen brightness-200",
    tyrell: "text-tyrell opacity-30",
    neutral: "text-neutral opacity-30"
};

function SuggestionRow({ suggestion }: SuggestionRowProps) {
    return (
        <div className="relative overflow-hidden bg-content1 hover:bg-content3">
            <Link to="/suggestions">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                    <FontAwesomeIcon icon={faFeatherPointed} className={classNames("ml-32 text-7xl", backgroundClasses[suggestion.card.faction])}/>
                </div>
                <div className="relative z-10 px-4 py-2 space-y-1">
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <ThronesIcon name={suggestion.card.type} />
                                <div className="text-md font-semibold text-foreground truncate">{suggestion.card.name}</div>
                                {!!suggestion.approvedBy && (
                                    <span className="text-xxs tracking-wide uppercase px-2 py-0.5 border text-success-700 border-success-300 bg-success-100 shrink-0">
                                        Approved
                                    </span>
                                )}
                            </div>
                            <div className="text-xs italic text-foreground/40">
                                Suggestion by {suggestion.user.displayname}
                            </div>
                        </div>
                        <div className="ml-auto flex flex-col items-end gap-1 shrink-0">
                            <div className="flex items-center gap-1 text-foreground/40 shrink-0 text-xs">
                                <FontAwesomeIcon icon={faThumbsUp} />
                                <span>{suggestion.likedBy.length}</span>
                            </div>
                            <Timestamp date={new Date(suggestion.updated)} isEdited={new Date(suggestion.updated) > new Date(suggestion.created)} className="text-xs italic text-foreground/40"/>
                        </div>
                    </div>
                    {suggestion.tags.length > 0 && <TagList tags={suggestion.tags} />}
                </div>
            </Link>
        </div>
    );
}

function TagList({ tags }: { tags: string[] }) {
    const visible = tags.slice(0, 3);
    const overflow = tags.length - visible.length;
    return (
        <div className="flex flex-wrap items-center gap-1">
            {visible.map((tag) => (
                <span
                    key={tag}
                    className="text-[0.5rem] tracking-wider uppercase px-2 py-0.5 bg-content2 border border-content3 text-foreground/50"
                >
                    {tag}
                </span>
            ))}
            {overflow > 0 && (
                <span className="text-xxs italic tracking-normal uppercase text-foreground/50">
                    +{overflow} more
                </span>
            )}
        </div>
    );
}
export type SuggestionRowProps = {
  suggestion: ICardSuggestion;
};