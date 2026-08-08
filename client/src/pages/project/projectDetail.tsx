import { useGetProjectQuery } from "../../api";
import { BaseElementProps } from "../../types";
import { addToast, Skeleton, Tab, Tabs } from "@heroui/react";
import { useState } from "react";
import EditProjectModal from "./editProjectModal";
import { useNavigate } from "react-router-dom";
import DeleteProjectModal from "./deleteProjectModal";
import ProjectHeader from "./projectHeader";
import ProjectDevelopment from "./projectDevelopment";
import ProjectDrafting from "./draft/projectDrafting";
import ProjectReleases from "./releases/projectReleases";
import ProjectArtworks from "./artworks/projectArtworks";
import classNames from "classnames";
import { dismoji, highlightTarget } from "../../constants";
import Error from "../../components/error";
import usePageTitle from "../../hooks/usePageTitle";
import Permission from "common/models/permissions";
import { usePermission } from "../../hooks/usePermission";
import useConsumableParams from "../../hooks/useConsumableParams";
import useHistoryState from "../../hooks/useHistoryState";
import Watermark from "../../components/watermark";

const PROJECT_PARAMS = ["tab", "release"] as const;
type ProjectTab = "development" | "artworks" | "releases";

// A release code implies the releases tab even without one named, so it wins over an absent tab param
function entryProjectTab(tab?: string, release?: string): ProjectTab {
    if (tab === "releases" || release) {
        return "releases";
    }
    return tab === "artworks" ? "artworks" : "development";
}

export default function ProjectDetail({ className, style, project: number }: ProjectDetailProps) {
    const { data: project, isLoading } = useGetProjectQuery({ number });
    usePageTitle(project ? project.code : undefined);
    const [isEditing, setIsEditing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    // A release code implies the releases tab, so a deep link needs the one param
    const { tab: entryTab, release: entryRelease } = useConsumableParams(PROJECT_PARAMS, ({ release }) =>
        release ? { highlight: highlightTarget.release(number, release) } : null
    );

    const [tab, setTab] = useHistoryState<ProjectTab>("tab", entryProjectTab(entryTab, entryRelease));
    const navigate = useNavigate();
    const canViewReleases = usePermission(Permission.READ_RELEASES);
    const canViewArtworks = usePermission(Permission.READ_SLOTS);

    if (isLoading) {
        return (
            <div>
                <Skeleton className="w-full h-98 rounded-md" />
            </div>
        );
    }

    if (!project) {
        return (
            <Error
                label="No such project exists in the Citadel's archives..."
                content="This project could not be found. It may have been removed, or you may have followed an incorrect link."
            />
        );
    }

    return (
        <div className={classNames("relative", className)} style={style}>
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <Watermark
                    position="top-right"
                    className={classNames(
                        "transition-opacity duration-500 ease-in",
                        project ? "opacity-100" : "opacity-0"
                    )}
                    icon={
                        project && (
                            <span className="-mt-12 mr-10 text-[10rem] md:-mt-24 md:mr-24 md:text-[16rem] opacity-20">
                                {project.emoji && dismoji[project.emoji]}
                            </span>
                        )
                    }
                />
            </div>
            <div className="relative space-y-2">
                <ProjectHeader
                    project={project}
                    onEdit={() => setIsEditing(true)}
                    onDelete={() => setIsDeleting(true)}
                />
                {project.draft ? (
                    <ProjectDrafting project={project} />
                ) : canViewReleases || canViewArtworks ? (
                    <Tabs
                        selectedKey={tab}
                        onSelectionChange={(key) => setTab(key as ProjectTab)}
                        aria-label="Project Sections"
                        variant="underlined"
                        color="primary"
                        size="lg"
                        destroyInactiveTabPanel={false}
                    >
                        <Tab key="development" title="Development">
                            <ProjectDevelopment project={project} />
                        </Tab>
                        {canViewArtworks ? (
                            <Tab key="artworks" title="Artworks">
                                <ProjectArtworks project={project} />
                            </Tab>
                        ) : null}
                        {canViewReleases ? (
                            <Tab key="releases" title="Releases">
                                <ProjectReleases project={project} isActive={tab === "releases"} />
                            </Tab>
                        ) : null}
                    </Tabs>
                ) : (
                    <ProjectDevelopment project={project} />
                )}
            </div>
            <EditProjectModal
                isOpen={isEditing}
                project={project}
                onClose={() => setIsEditing(false)}
                onSave={(project) =>
                    addToast({
                        title: "Successfully saved",
                        color: "success",
                        description: `${project.name} has been updated`
                    })
                }
            />
            {project && (
                <DeleteProjectModal
                    isOpen={isDeleting}
                    project={project}
                    onClose={() => setIsDeleting(false)}
                    onDelete={(project) => {
                        navigate("/");
                        addToast({
                            title: "Successfully deleted",
                            color: "success",
                            description: `'${project.name} has been deleted`
                        });
                    }}
                />
            )}
        </div>
    );
}

type ProjectDetailProps = Omit<BaseElementProps, "children"> & {
    project: number;
};
