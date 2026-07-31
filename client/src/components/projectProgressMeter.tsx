import Permission from "common/models/permissions";
import { useGetProjectProgressQuery } from "../api";
import { usePermission } from "../hooks/usePermission";
import { getErrorMessage } from "../api/errors";
import ProgressMeter, { ProgressUnavailable } from "./progressMeter";
import { BaseElementProps } from "../types";

export default function ProjectProgressMeter({ className, style, project, size = "lg" }: ProjectProgressMeterProps) {
    const canReadStats = usePermission(Permission.READ_STATS_PROJECT);
    const { data, isLoading, error } = useGetProjectProgressQuery({ project }, { skip: !canReadStats });

    if (!canReadStats) {
        return null;
    }
    if (error) {
        return <ProgressUnavailable className={className} style={style} reason={getErrorMessage(error)} size={size} />;
    }
    // A project with no cards has nothing to average, so there's no meaningful percentage
    if (!isLoading && data?.overall === undefined) {
        return null;
    }

    // Drawn empty from the off, so the meter counts up to the average rather than appearing at it
    return (
        <ProgressMeter
            className={className}
            style={style}
            label="Overall Progress"
            value={data?.overall}
            size={size}
            info={`The average completeness of ${data ? `all ${data.cardCount} cards` : "every card"} in this project, across their design, artwork and production.`}
        />
    );
}

type ProjectProgressMeterProps = Omit<BaseElementProps, "children"> & {
    project: number;
    size?: "sm" | "lg";
};
