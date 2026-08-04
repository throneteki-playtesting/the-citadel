import { ReactNode } from "react";
import { Avatar, AvatarGroup, Progress, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faCircleInfo, faHourglassHalf, faXmark } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { useGetReleaseCheckSummaryQuery } from "../api";
import { TouchTooltip } from "./touchTooltip";
import { BaseElementProps } from "../types";
import { averageStatementAnswer, StatementAnswer, statementAnswers } from "common/models/reviews";
import { IReleasableAnswer } from "common/models/slots";
import { SemanticVersion } from "common/utils";
import { stackedAvatarClasses } from "../constants";
import { statementAnswerDetails } from "./statementAnswerDetails";
import StatementAnswerIcon from "./statementAnswerIcon";
import UserAvatar, { UserRow } from "./userAvatar";

// Shared so the loading skeleton keeps the same shape, and doesn't shift the layout when it resolves
const TALLY_CLASSES = "flex flex-col gap-1.5";
// Both rows stack on mobile, where side-by-side entries get squeezed into awkward wraps
const HEADER_ROW_CLASSES =
    "flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2 text-xs sm:text-sm";
const STATUS_ROW_CLASSES = "flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3 text-xs";

// Playtester sentiment reads as a verdict rather than a tally, so the average gets a sentence, not a count
const RELEASABLE_SUMMARIES: Record<StatementAnswer, ReactNode> = {
    "strongly disagree": (
        <>
            Playtesters <b>strongly disagree</b> it's releasable
        </>
    ),
    "somewhat disagree": (
        <>
            Playtesters <b>somewhat disagree</b> it's releasable
        </>
    ),
    "neither agree nor disagree": (
        <>
            Playtesters are <b>undecided</b> on releasing it
        </>
    ),
    "somewhat agree": (
        <>
            Playtesters <b>somewhat agree</b> it's releasable
        </>
    ),
    "strongly agree": (
        <>
            Playtesters <b>strongly agree</b> it's releasable
        </>
    )
};

const MAX_REVIEWER_AVATARS = 5;

// Sign-off tally for a slot - how many said yes/no, and how many eligible submitters are yet to answer
export default function ReleaseCheckTally({
    className,
    style,
    project,
    number,
    showBar = true,
    showPending = true
}: ReleaseCheckTallyProps) {
    const { data, isLoading } = useGetReleaseCheckSummaryQuery({ project, number });

    if (isLoading) {
        return (
            <div className={classNames(TALLY_CLASSES, className)} style={style}>
                <div className={HEADER_ROW_CLASSES}>
                    <Skeleton className="h-4 sm:h-5 w-48 rounded-md" />
                    <Skeleton className="h-4 sm:h-5 w-16 rounded-md" />
                </div>
                {/* Empty rather than skeletal - a bar is already its own progress indicator */}
                {showBar && <Progress aria-label="Ready responses" value={0} color="success" size="sm" />}
                <div className={STATUS_ROW_CLASSES}>
                    <Skeleton className="h-4 w-16 rounded-md" />
                    <Skeleton className="h-4 w-24 rounded-md" />
                    <Skeleton className="h-4 w-24 rounded-md" />
                </div>
            </div>
        );
    }
    if (!data) {
        return null;
    }

    // Empty unless the latest version has been reviewed at all - nothing is shown in its place. Most
    // negative answers lead, so the strongest objection always survives the avatar group's cutoff
    const answers = [...data.releasable].sort(
        (a, b) => statementAnswers.indexOf(a.answer) - statementAnswers.indexOf(b.answer)
    );
    const average = averageStatementAnswer(answers.map((entry) => entry.answer));
    // Stale checks answered a version that no longer exists, so they're excluded from the total too
    const answered = data.ready + data.notReady;
    // Measured against responses received, not the eligible roster - silence isn't a vote against
    const readyPct = answered === 0 ? 0 : (data.ready / answered) * 100;

    return (
        <div className={classNames(TALLY_CLASSES, className)} style={style}>
            <div className={HEADER_ROW_CLASSES}>
                {answered === 0 ? (
                    <span className="font-medium">
                        {data.stale > 0
                            ? `Release checks reset${data.version ? ` for v${data.version}` : ""}`
                            : "No release checks submitted"}
                    </span>
                ) : (
                    <>
                        <span className="font-medium">{Math.round(readyPct)}% of responses marked as ready</span>
                        <span className="text-foreground/50 text-xs">{answered} answered</span>
                    </>
                )}
            </div>
            {showBar && answered > 0 && (
                <Progress aria-label="Ready responses" value={readyPct} color="success" size="sm" />
            )}
            <div className={STATUS_ROW_CLASSES}>
                <span className="flex items-center gap-1 text-success">
                    <FontAwesomeIcon icon={faCheck} /> {data.ready} ready
                </span>
                <span className="flex items-center gap-1 text-warning">
                    <FontAwesomeIcon icon={faXmark} /> {data.notReady} not ready
                </span>
                {showPending && data.total > 0 && (
                    <span className="flex items-center gap-1 text-foreground/40">
                        <FontAwesomeIcon icon={faHourglassHalf} /> {data.pending} awaiting
                        {data.stale > 0 && ` (${data.stale} stale)`}
                        <TouchTooltip
                            content={
                                <div className="max-w-56 text-xs flex flex-col gap-1.5">
                                    <span>
                                        How many people are able to submit a release check for this card, but have not
                                        yet.
                                    </span>
                                    {data.stale > 0 && (
                                        <span>
                                            Of those, {data.stale} answered an older version of this card, and are
                                            awaiting a re-check.
                                        </span>
                                    )}
                                </div>
                            }
                        >
                            <FontAwesomeIcon icon={faCircleInfo} className="cursor-help" />
                        </TouchTooltip>
                    </span>
                )}
            </div>
            {average && <ReleasableSummary answers={answers} average={average} version={data.version} />}
        </div>
    );
}

// The average answer, with the reviewers behind it - each named with their own answer in the tooltip
function ReleasableSummary({ answers, average, version }: ReleasableSummaryProps) {
    return (
        <TouchTooltip
            placement="top"
            content={
                <div className="flex flex-col gap-1.5 py-1 w-64 max-w-full">
                    <span className="text-xs text-foreground/50">Playtester reviews of v{version}</span>
                    {answers.map((entry) => (
                        <ReviewerAnswer key={entry.reviewer} entry={entry} />
                    ))}
                </div>
            }
        >
            <div className="flex items-center gap-2 w-fit cursor-help">
                <AvatarGroup
                    size="sm"
                    max={MAX_REVIEWER_AVATARS}
                    className="-space-x-2"
                    renderCount={(count: number) => (
                        <Avatar size="sm" name={`+${count}`} className={stackedAvatarClasses} />
                    )}
                >
                    {answers.map((entry) => (
                        <StackedReviewerAvatar key={entry.reviewer} discordId={entry.reviewer} />
                    ))}
                </AvatarGroup>
                <span className={classNames("text-xs", statementAnswerDetails[average].color)}>
                    {RELEASABLE_SUMMARIES[average]}
                </span>
                <StatementAnswerIcon answer={average} tooltip={false} />
            </div>
        </TouchTooltip>
    );
}

// AvatarGroup overwrites the className of its direct children when it clones them, taking the stacked
// styling with it. Going through a wrapper keeps it out of reach, as the checks modal's ready stack does
function StackedReviewerAvatar({ discordId }: { discordId: string }) {
    return <UserAvatar discordId={discordId} className={stackedAvatarClasses} />;
}

function ReviewerAnswer({ entry }: { entry: IReleasableAnswer }) {
    const { label, color } = statementAnswerDetails[entry.answer];
    return (
        <UserRow
            discordId={entry.reviewer}
            trailing={<span className={classNames("ml-auto shrink-0 text-xs whitespace-nowrap", color)}>{label}</span>}
        />
    );
}

type ReleasableSummaryProps = {
    answers: IReleasableAnswer[];
    average: StatementAnswer;
    /** Card version the answers were given against - all of them, since older reviews never reach here */
    version?: SemanticVersion;
};

type ReleaseCheckTallyProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
    showBar?: boolean;
    showPending?: boolean;
};
