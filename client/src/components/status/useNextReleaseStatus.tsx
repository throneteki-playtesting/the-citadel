import { useMemo } from "react";
import { IProject } from "common/models/projects";
import { useGetSlotsQuery } from "../../api";

export function useNextReleaseStatus(project: IProject) {
    const release = useMemo(() => {
        const sorted = [...project.releases].sort((a, b) => a.number - b.number);
        return sorted.find((release) => !release.releasedDate) ?? sorted[sorted.length - 1];
    }, [project.releases]);

    const { data: slotsData, isLoading } = useGetSlotsQuery({ project: project.number }, { skip: !release });

    const filled = useMemo(() => {
        if (!release) {
            return 0;
        }
        return (slotsData?.items ?? []).filter((slot) => slot.release?.code === release.code).length;
    }, [slotsData, release]);

    return { release, filled, isLoading: isLoading && !!release };
}
