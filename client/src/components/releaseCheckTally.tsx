import { Progress, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faCircleInfo, faHourglassHalf, faXmark } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { useGetReleaseCheckSummaryQuery } from "../api";
import { TouchTooltip } from "./touchTooltip";
import { BaseElementProps } from "../types";

// Shared so the loading skeleton keeps the same shape, and doesn't shift the layout when it resolves
const TALLY_CLASSES = "flex flex-col gap-1.5";
// Both rows stack on mobile, where side-by-side entries get squeezed into awkward wraps
const HEADER_ROW_CLASSES =
    "flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2 text-xs sm:text-sm";
const STATUS_ROW_CLASSES = "flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3 text-xs";

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
        </div>
    );
}

type ReleaseCheckTallyProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
    showBar?: boolean;
    showPending?: boolean;
};
