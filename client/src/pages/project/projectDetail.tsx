import { useGetProjectQuery } from "../../api";
import { BaseElementProps } from "../../types";
import { addToast, Skeleton } from "@heroui/react";
import { useState } from "react";
import EditProjectModal from "./editProjectModal";
import { useNavigate } from "react-router-dom";
import DeleteProjectModal from "./deleteProjectModal";
import ProjectHeader from "./projectHeader";
import ProjectContent from "./projectContent";
import ProjectDrafting from "./draft/projectDrafting";
import dismoji from "../../emojis";
import classNames from "classnames";

const ProjectDetail = ({ className, style, project: number }: ProjectDetailProps) => {
    const { data: project, isLoading } = useGetProjectQuery({ number: number! });
    const [isEditing, setIsEditing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const navigate = useNavigate();

    if (isLoading) {
        return (
            <div>
                <Skeleton className="w-full h-98 rounded-md"/>
            </div>
        );
    }

    if (!project) {
        // TODO: Improve
        return (
            <div>
                Error
            </div>
        );
    }

    return <div className={classNames("relative", className)} style={style}>
        <div className={classNames("absolute right-0 top-0 flex items-center justify-center pointer-events-none select-none transition-opacity duration-500 ease-in", project ? "opacity-100" : "opacity-0")}>
            {project && <span className="-mt-24 mr-1/4 text-[16rem] opacity-20">{project.emoji && dismoji[project.emoji]}</span>}
        </div>
        <div className="space-y-2">
            <ProjectHeader project={project} onEdit={() => setIsEditing(true)} onDelete={() => setIsDeleting(true)}/>
            {
                project?.draft
                    ? <ProjectDrafting project={project} />
                    : <ProjectContent project={project} />
            }
        </div>
        <EditProjectModal isOpen={isEditing} project={project} onClose={() => setIsEditing(false)} onSave={(project) => addToast({ title: "Successfully saved", color: "success", description: `${project.name} has been updated` })}/>
        {project && <DeleteProjectModal isOpen={isDeleting} project={project} onClose={() => setIsDeleting(false)} onDelete={(project) => {
            navigate("/");
            addToast({ title: "Successfully deleted", color: "success", description: `'${project.name} has been deleted` });
        }}/>}
    </div>;
};

type ProjectDetailProps = Omit<BaseElementProps, "children"> & { project: number };

export default ProjectDetail;
