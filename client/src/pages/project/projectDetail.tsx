import { useGetCardsQuery, useGetProjectQuery } from "../../api";
import { BaseElementProps } from "../../types";
import { addToast, Card } from "@heroui/react";
import { useState } from "react";
import EditProjectModal from "./editProjectModal";
import { useNavigate } from "react-router-dom";
import DeleteProjectModal from "./deleteProjectModal";
import ProjectHeader from "./projectHeader";
import ProjectContent from "./projectContent";
import ProjectDrafting from "./draft/projectDrafting";

const ProjectDetail = ({ className, style, project: number }: ProjectDetailProps) => {
    const { data: project, isLoading: isProjectLoading } = useGetProjectQuery({ number: number! });
    const { data: cardsData, isLoading: isCardsLoading } = useGetCardsQuery({ filter: { project: number, latest: true } });
    const [isEditing, setIsEditing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const navigate = useNavigate();

    return <div className={className} style={style}>
        <Card className="p-3 md:p-4 lg:p-6 rounded-b-none">
            <ProjectHeader project={project} cards={cardsData?.items} isLoading={isProjectLoading} onEdit={() => setIsEditing(true)} onDelete={() => setIsDeleting(true)}/>
        </Card>
        <Card className="rounded-t-none">
            {
                project?.draft
                    ? <ProjectDrafting project={project} cards={cardsData?.items} isLoading={isCardsLoading}/>
                    : <ProjectContent cards={cardsData?.items} />
            }
        </Card>
        <EditProjectModal isOpen={isEditing} project={project} onClose={() => setIsEditing(false)} onSave={(project) => addToast({ title: "Successfully saved", color: "success", description: `${project.name} has been updated` })}/>
        {project && <DeleteProjectModal isOpen={isDeleting} project={project} onClose={() => setIsDeleting(false)} onDelete={(project) => {
            navigate("/");
            addToast({ title: "Successfully deleted", color: "success", description: `'${project.name} has been deleted` });
        }}/>}
    </div>;
};

type ProjectDetailProps = Omit<BaseElementProps, "children"> & { project: number };

export default ProjectDetail;
