import { IProject } from "common/models/projects";
import CycleReleases from "./cycleReleases";
import ExpansionRelease from "./expansionRelease";

// Cycles plan multiple sequenced packs from a development pool; expansions have a single fixed release
export default function ProjectReleases({ project }: ProjectReleasesProps) {
    return project.type === "expansion"
        ? <ExpansionRelease project={project}/>
        : <CycleReleases project={project}/>;
};

type ProjectReleasesProps = { project: IProject };
