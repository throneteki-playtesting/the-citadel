import { ReleaseStatus } from "common/models/projects";
import Permission from "common/models/permissions";
import { useGetReleasesProgressQuery } from "../../../api";
import { usePermission } from "../../../hooks/usePermission";
import { getErrorMessage } from "../../../api/errors";
import { releaseStatusColors } from "../../../constants";
import ProgressMeter, { ProgressUnavailable } from "../../../components/progressMeter";
import { BaseElementProps } from "../../../types";

// Every release on the page subscribes to the same project-wide query, which RTK Query dedupes
// into a single request - no need to thread progress down through the release blocks
export default function ReleaseProgressMeter({ className, style, project, code, status }: ReleaseProgressMeterProps) {
    const canReadStats = usePermission(Permission.READ_STATS_RELEASE);
    const { data, isLoading, error } = useGetReleasesProgressQuery({ project }, { skip: !canReadStats });

    if (!canReadStats) {
        return null;
    }
    const progress = data?.find((entry) => entry.code === code);
    if (!isLoading && !progress) {
        return (
            <ProgressUnavailable
                reason={error ? getErrorMessage(error) : "No progress data was returned for this release"}
            />
        );
    }

    // Drawn empty from the off, so the meter counts up to the release's progress rather than appearing at it
    return (
        <ProgressMeter
            className={className}
            style={style}
            label="Progress"
            layout="inline"
            value={progress?.overall}
            color={releaseStatusColors[status]}
            info="Combines the completeness of this release's cards with how far the release itself has progressed."
        />
    );
}

type ReleaseProgressMeterProps = Omit<BaseElementProps, "children"> & {
    project: number;
    code: string;
    status: ReleaseStatus;
};
