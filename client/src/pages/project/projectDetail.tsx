import { useGetProjectQuery } from "../../api";
import { BaseElementProps } from "../../types";
import { addToast, Skeleton, Tab, Tabs } from "@heroui/react";
import { useState } from "react";
import EditProjectModal from "./editProjectModal";
import { useNavigate, useSearchParams } from "react-router-dom";
import DeleteProjectModal from "./deleteProjectModal";
import ProjectHeader from "./projectHeader";
import ProjectDevelopment from "./projectDevelopment";
import ProjectDrafting from "./draft/projectDrafting";
import ProjectReleases from "./releases/projectReleases";
import classNames from "classnames";
import { dismoji } from "../../constants";
import Error from "../../components/error";
import usePageTitle from "../../hooks/usePageTitle";
import Permission from "common/models/permissions";
import { usePermission } from "../../hooks/usePermission";
import Watermark from "../../components/watermark";

export default function ProjectDetail({ className, style, project: number }: ProjectDetailProps) {
    const { data: project, isLoading } = useGetProjectQuery({ number });
    usePageTitle(project ? project.code : undefined);
    const [isEditing, setIsEditing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get("tab") === "releases" ? "releases" : "development";
    const navigate = useNavigate();
    const canViewReleases = usePermission(Permission.READ_RELEASES);

    if (isLoading) {
        return (
            <div>
                <Skeleton className="w-full h-98 rounded-md"/>
            </div>
        );
    }

    if (!project) {
        return <Error label="No such project exists in the Citadel's archives..." content="This project could not be found. It may have been removed, or you may have followed an incorrect link." />;
    }

    return <div className={classNames("relative overflow-hidden", className)} style={style}>
        <Watermark
            position="top-right"
            className={classNames("transition-opacity duration-500 ease-in", project ? "opacity-100" : "opacity-0")}
            icon={project && <span className="-mt-12 mr-10 text-[10rem] md:-mt-24 md:mr-24 md:text-[16rem] opacity-20">{project.emoji && dismoji[project.emoji]}</span>}
        />
        <div className="relative space-y-2">
            <ProjectHeader project={project} onEdit={() => setIsEditing(true)} onDelete={() => setIsDeleting(true)}/>
            {project.draft ? (
                <ProjectDrafting project={project} />
            ) : canViewReleases ? (
                <Tabs
                    selectedKey={tab}
                    onSelectionChange={(key) => setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        if (key === "releases") {
                            next.set("tab", "releases");
                        } else {
                            next.delete("tab");
                        }
                        return next;
                    }, { replace: true })}
                    aria-label="Project Sections"
                    variant="underlined"
                    color="primary"
                    size="lg"
                    destroyInactiveTabPanel={false}
                >
                    <Tab key="development" title="Development">
                        <ProjectDevelopment project={project} />
                    </Tab>
                    <Tab key="releases" title="Releases">
                        <ProjectReleases project={project} />
                    </Tab>
                </Tabs>
            ) : (
                <ProjectDevelopment project={project} />
            )}
        </div>
        <EditProjectModal isOpen={isEditing} project={project} onClose={() => setIsEditing(false)} onSave={(project) => addToast({ title: "Successfully saved", color: "success", description: `${project.name} has been updated` })}/>
        {project && <DeleteProjectModal isOpen={isDeleting} project={project} onClose={() => setIsDeleting(false)} onDelete={(project) => {
            navigate("/");
            addToast({ title: "Successfully deleted", color: "success", description: `'${project.name} has been deleted` });
        }}/>}
    </div>;
};

type ProjectDetailProps = Omit<BaseElementProps, "children"> & {
    project: number;
};