import { createContext, useContext } from "react";
import { IProject } from "common/models/projects";

export const ProjectScopeContext = createContext<ProjectScopeValue>({ isLoading: false });

export function useProjectScope() {
    return useContext(ProjectScopeContext);
}

type ProjectScopeValue = {
    project?: IProject;
    isLoading: boolean;
};
