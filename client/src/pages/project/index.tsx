import { Navigate, useNavigate, useParams } from "react-router-dom";
import ProjectDetail from "./projectDetail";
import { parseParamNumber } from "../../utils";
import EditProjectModal from "./editProjectModal";
import { addToast } from "@heroui/react";

const Project = ({ isCreating = false }: ProjectProps) => {
    const { number } = useParams();
    const navigate = useNavigate();

    const project = parseParamNumber(number);

    if (isCreating) {
        return <EditProjectModal
            isOpen={true}
            onSave={(project) => {
                navigate(`/project/${project.number}`);
                addToast({ title: "Successfully created", color: "success", description: `${project.name} has been created` });
            }}
            onClose={() => {
                navigate("/");
            }}
        />;
    } else if (!project) {
        return <Navigate to="/" />;
    }
    return (
        <ProjectDetail key={project} project={project}/>
    );
};

type ProjectProps = { isCreating?: boolean };

export default Project;