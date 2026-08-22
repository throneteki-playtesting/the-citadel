import { useMemo } from "react";
import Permission from "common/models/permissions";
import { isReleaseBound } from "common/models/slots";
import { useGetProjectQuery, useGetSlotQuery } from "../api";
import { usePermission } from "./usePermission";

// Whether a card is locked to its printed form - same slot+release join cardHeader's ReleaseChip uses,
// shared wherever that needs saying: the version label, the tile badge, and the draft editor's warning.
export function useIsReleaseBound(project?: number, number?: number): boolean {
    const canReadReleases = usePermission(Permission.READ_RELEASES);
    const skip = !canReadReleases || project === undefined || number === undefined;
    const { data: slot } = useGetSlotQuery({ project: project ?? 0, number: number ?? 0 }, { skip });
    const { data: projectData } = useGetProjectQuery({ number: project ?? 0 }, { skip });
    const release = useMemo(
        () => slot?.release && projectData?.releases.find((entry) => entry.code === slot.release?.code),
        [projectData?.releases, slot?.release]
    );
    return !!slot && isReleaseBound(slot.statuses.design.status, release?.status);
}
