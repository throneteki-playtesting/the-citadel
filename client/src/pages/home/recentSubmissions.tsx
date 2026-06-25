import { useGetCardQuery, useGetReviewsQuery, useGetSuggestionsQuery, useGetUserQuery } from "../../api";
import Permission from "common/models/permissions";
import { useMemo } from "react";
import { ICardSuggestion } from "common/models/cards";
import { IPlaytestReview, StatementAnswer, Statements } from "common/models/reviews";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheckCircle, faCircleQuestion, faFeatherPointed, faThumbsUp } from "@fortawesome/free-solid-svg-icons";
import { Alert, Avatar, Skeleton } from "@heroui/react";
import ThronesIcon from "../../components/thronesIcon";
import classNames from "classnames";
import Timestamp from "../../components/timestamp";
import { highlightTarget, watermarkClasses } from "../../constants";
import SectionTitle from "../../components/sectionTitle";
import { usePermission } from "../../hooks/usePermission";
import PermissionedLink from "../../components/permissionedLink";

type Submission = { key: string, type: "suggestion" } & ICardSuggestion | { key: string, type: "review" } & IPlaytestReview;

export default function RecentSubmissions() {
    const items = 5;
    const hasReviewReadPermission = usePermission(Permission.READ_REVIEWS);
    const hasSuggestionReadPermission = usePermission(Permission.READ_SUGGESTIONS);
    const { data: reviewData, isLoading: isReviewDataLoading } = useGetReviewsQuery({ orderBy: { updated: "desc" }, page: 1, perPage: 5 }, { skip: !hasReviewReadPermission });
    const { data: suggestionData, isLoading: isSuggestionDataLoading } = useGetSuggestionsQuery({ orderBy: { updated: "desc" }, page: 1, perPage: 5 }, { skip: !hasSuggestionReadPermission });

    const isLoading = useMemo(() => isReviewDataLoading || isSuggestionDataLoading, [isReviewDataLoading, isSuggestionDataLoading]);

    const submissions = useMemo(() => {
        const reviews = reviewData?.items;
        const suggestions = suggestionData?.items;
        if (reviews && suggestions) {
            return [
                ...reviews.map((r) => ({ key: `${r.project}|${r.number}|${r.version}|${r.reviewer}`, type: "review", ...r }) as Submission),
                ...suggestions.map((s) => ({ key: s.id, type: "suggestion", ...s }) as Submission)
            ].sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()).slice(0, items);
        } else {
            return [];
        }
    }, [reviewData?.items, suggestionData?.items]);

    const content = useMemo(() => {
        if (isLoading) {
            const array = Array.from({ length: items });
            return array.map((_, index) => (
                <div key={index} className="relative z-10 px-4 py-2">
                    <div className="min-w-0 space-y-1">
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                            <Skeleton className="w-32 h-4 rounded-sm"/>
                        </div>
                        <div className="flex gap-2 items-center">
                            <Skeleton className="shrink-0 size-10 sm:size-8 md:size-10 rounded-full"/>
                            <div className="flex flex-col gap-1 min-w-0">
                                <Skeleton className="w-42 h-4 rounded-sm" />
                                <Skeleton className="w-32 h-4 rounded-sm" />
                            </div>
                        </div>
                    </div>
                </div>
            ));
        }
        return submissions?.map((submission) => (
            <SubmissionRow key={submission.key} submission={submission} />
        ));
    }, [isLoading, submissions]);

    return (
        <div className="space-y-2">
            <SectionTitle size="sm" indent="xs">
                Recent Submissions
            </SectionTitle>
            <div className="border border-content3 divide-y divide-content3">
                {content}
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
    const { data: user, isLoading: isUserLoading } = useGetUserQuery({ discordId: review.reviewer });
    const { data: card, isLoading: isCardLoading } = useGetCardQuery({ project: review.project, number: review.number, version: review.version });

    const isLoading = isUserLoading || isCardLoading;

    if (isLoading) {
        return (
            <div className="relative z-10 px-4 py-2">
                <div className="min-w-0 space-y-1">
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                        <Skeleton className="w-32 h-4 rounded-sm"/>
                    </div>
                    <div className="flex gap-2 items-center">
                        <Skeleton className="shrink-0 size-10 sm:size-8 md:size-10 rounded-full"/>
                        <div className="flex flex-col gap-1 min-w-0">
                            <Skeleton className="w-42 h-4 rounded-sm" />
                            <Skeleton className="w-32 h-4 rounded-sm" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!card) {
        return (
            <Alert color="danger">
                <div className="hidden">{`Project: ${review.project}, Number: ${review.number}, Version: ${review.version}, Reviewer: ${review.reviewer}`}</div>
                <div className="text-sm">Failed to load review. Please alert an administrator.</div>
            </Alert>
        );
    }

    return (
        <div className="relative overflow-hidden bg-content1 hover:bg-content3">
            <PermissionedLink to={`/project/${review.project}/${review.number}`} state={{ highlight: highlightTarget.review(review) }} requires={Permission.READ_REVIEWS}>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                    <FontAwesomeIcon icon={faFeatherPointed} className={classNames("ml-32 text-7xl", watermarkClasses[card.faction])}/>
                </div>
                <div className="relative min-w-0 space-y-0.5 px-4 py-2">
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                        <div className="text-md font-cinzel text-foreground truncate">{card.name} <span className="text-foreground/50">{card.version}</span></div>
                        <Timestamp className="my-auto text-xs italic text-foreground/40" date={new Date(review.updated)} />
                    </div>
                    <div className="flex gap-2 items-center">
                        <Avatar src={user?.avatarUrl} name={user?.displayname ?? "Unknown"} className="shrink-0 size-10 sm:size-8 md:size-10"/>
                        <div className="flex flex-col gap-1 min-w-0">
                            <div className="text-xs font-crimson italic text-foreground/40">
                                    Review by {user?.displayname ?? "Unknown Playtester"}
                            </div>
                            <StatementBars statements={review.statements} />
                            <div className="text-xxs font-crimson italic truncate text-foreground/40">
                                {review.played} {review.played !== 1 ? "games" : "game"} played
                            </div>
                        </div>
                    </div>
                </div>
            </PermissionedLink>
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

function SuggestionRow({ suggestion }: SuggestionRowProps) {
    const isApproved = !!suggestion.approvedBy;

    return (
        <div className="relative overflow-hidden bg-content1 hover:bg-content3">
            <PermissionedLink to="/suggestions" requires={Permission.READ_SUGGESTIONS}>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                    <div className="relative ml-32">
                        <ThronesIcon name={suggestion.card.faction} className={classNames("text-7xl", watermarkClasses[suggestion.card.faction])}/>
                        <FontAwesomeIcon icon={isApproved ? faCheckCircle : faCircleQuestion} className="absolute right-0 bottom-0 text-2xl opacity-20"/>
                    </div>
                </div>
                <div className="relative z-10 px-4 py-3 space-y-1">
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                        <div className="min-w-0">
                            <div className="flex gap-2 flex-wrap">
                                <div className="text-sm font-cinzel text-foreground truncate"><ThronesIcon name={suggestion.card.type} /> {suggestion.card.name}</div>
                                {isApproved && (
                                    <span className="text-xxs tracking-wide font-sans uppercase px-2 py-0.5 border text-success-700 border-success-300 bg-success-100 shrink-0">
                                        Approved
                                    </span>
                                )}
                            </div>
                            <div className="text-xs font-crimson italic text-foreground/40">
                                Suggestion by {suggestion.user.displayname}
                            </div>
                        </div>
                        <div className="ml-auto flex flex-col items-end gap-1 shrink-0">
                            <div className="flex items-center gap-1 font-sans text-foreground/40 shrink-0 text-xs">
                                <FontAwesomeIcon icon={faThumbsUp} />
                                <span>{suggestion.likedBy.length}</span>
                            </div>
                            <Timestamp date={new Date(suggestion.updated)} className="text-xs font-sans italic text-foreground/40"/>
                        </div>
                    </div>
                    {suggestion.tags.length > 0 && <TagList tags={suggestion.tags} />}
                </div>
            </PermissionedLink>
        </div>
    );
}
type SuggestionRowProps = {
  suggestion: ICardSuggestion;
};

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