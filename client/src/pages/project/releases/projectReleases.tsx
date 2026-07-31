import { IProject } from "common/models/projects";
import CycleReleases from "./cycleReleases";
import ExpansionRelease from "./expansionRelease";

// Cycles plan multiple sequenced packs from a development pool; expansions have a single fixed release
export default function ProjectReleases({ project, isActive }: ProjectReleasesProps) {
    return project.type === "expansion" ? (
        <ExpansionRelease project={project} />
    ) : (
        <CycleReleases project={project} isActive={isActive} />
    );
}

type ProjectReleasesProps = {
    project: IProject;
    isActive: boolean;
};
