import { useGetCardsQuery, useGetProjectQuery } from "../../api";
import { BaseElementProps } from "../../types";
import { addToast, Card } from "@heroui/react";
import { useEffect, useMemo, useState } from "react";
import EditProjectModal from "./editProjectModal";
import { useNavigate } from "react-router-dom";
import DeleteProjectModal from "./deleteProjectModal";
import ProjectHeader from "./projectHeader";
import ProjectContent from "./projectContent";

const ProjectDetail = ({ className, style, project: number }: ProjectDetailProps) => {
    const isNew = useMemo(() => !number, [number]);
    const { data: project, isLoading: isProjectLoading } = useGetProjectQuery({ number: number! }, { skip: isNew });
    const { data: cardsData, isLoading: isCardsLoading } = useGetCardsQuery({ filter: { project: number } }, { skip: isNew });
    const [isEditing, setIsEditing] = useState(isNew);
    const [isDeleting, setIsDeleting] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        setIsEditing(isNew);
    }, [isNew]);

    return <div className={className} style={style}>
        <Card className="p-3 md:p-4 lg:p-6 rounded-b-none">
            <ProjectHeader project={project} cards={cardsData?.items} isLoading={isProjectLoading} onEdit={() => setIsEditing(true)} onDelete={() => setIsDeleting(true)}/>
        </Card>
        <Card className="p-1 md:p-2 lg:p-3 rounded-t-none">
            <ProjectContent project={project} cards={cardsData?.items} isLoading={isCardsLoading}/>
        </Card>
        <EditProjectModal isOpen={isEditing} project={project} onClose={() => setIsEditing(false)} onSave={(project) => {
            if (isNew) {
                navigate(`/project/${project.number}`);
            }
            addToast({ title: "Successfully saved", color: "success", description: `${project.name} has been ${isNew ? "created" : "updated"}` });
        }}/>
        {project && <DeleteProjectModal isOpen={isDeleting} project={project} onClose={() => setIsDeleting(false)} onDelete={(project) => {
            navigate("/");
            addToast({ title: "Successfully deleted", color: "success", description: `'${project.name} has been deleted` });
        }}/>}
    </div>;
};

type ProjectDetailProps = Omit<BaseElementProps, "children"> & { project?: number };

export default ProjectDetail;
