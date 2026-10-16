import { useMemo } from "react";
import { withProjectOwnership } from "common/utils";
import { useAuth } from "./useAuth";
import { useProjectScope } from "./useProjectScope";

// The current user as permission checks should see them - holding their owner permissions inside a project they own
export function useScopedUser() {
    const { user, isLoading } = useAuth();
    const { project, isLoading: isLoadingProject } = useProjectScope();

    const scoped = useMemo(() => {
        if (!user || !project || user.impersonation?.type === "role") {
            return user;
        }
        return withProjectOwnership(user, project);
    }, [user, project]);

    return { user: scoped, isLoading: isLoading || isLoadingProject };
}
