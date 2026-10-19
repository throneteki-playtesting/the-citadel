import { useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import Permission from "common/models/permissions";
import { IProject } from "common/models/projects";
import { hasPermission, withProjectOwnership } from "common/utils";
import api, { useGetProjectsQuery } from "../../api";
import type { AppDispatch, RootState } from "../../api/store";
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

// Whether the viewer has this suggestion in the pool of at least one of the projects. The pools are watched through the
// store rather than a query each, since how many there are isn't fixed
export function useIsPooledByMe(suggestion: string | undefined, projects: IProject[]) {
    const dispatch = useDispatch<AppDispatch>();
    const me = useAuth().user?.discordId;
    useEffect(() => {
        const subscriptions = projects.map((project) =>
            dispatch(api.endpoints.getPool.initiate({ project: project.number }))
        );
        return () => subscriptions.forEach((subscription) => subscription.unsubscribe());
    }, [dispatch, projects]);
    return useSelector((state: RootState) =>
        projects.some((project) =>
            api.endpoints.getPool
                .select({ project: project.number })(state)
                .data?.some((entry) => entry.suggestion === suggestion && entry.adds.some((mark) => mark.user === me))
        )
    );
}

export function poolLabel(isPooled: boolean) {
    return isPooled ? "Added to your pool" : "Add to Pool";
}
