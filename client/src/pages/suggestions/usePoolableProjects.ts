import { useMemo } from "react";
import Permission from "common/models/permissions";
import { hasPermission, withProjectOwnership } from "common/utils";
import { useGetProjectsQuery } from "../../api";
import { useAuth } from "../../hooks/useAuth";

// The draft projects the viewer can draft in, which are the ones whose pool they can add to
export function usePoolableProjects() {
    const { user } = useAuth();
    const { data } = useGetProjectsQuery({ filter: { draft: true } });
    return useMemo(
        () =>
            user
                ? (data?.items ?? []).filter((project) =>
                      hasPermission(withProjectOwnership(user, project), Permission.CREATE_CARDS)
                  )
                : [],
        [data, user]
    );
}
