import { Navigate, useNavigate, useParams } from "react-router-dom";
import ProjectDetail from "./projectDetail";
import { parseParamNumber } from "../../utils";
import EditProjectModal from "./editProjectModal";
import { addToast } from "@heroui/react";

export default function Project({ isCreating = false }: ProjectProps) {
    const params = useParams();
    const navigate = useNavigate();

    const project = parseParamNumber(params.number);

    if (isCreating) {
        return <EditProjectModal
            isOpen={true}
            onSave={async (project) => {
                navigate(`/project/${project.number}`);
                addToast({ title: "Successfully created", color: "success", description: `${project.name} has been created` });
            }}
            onClose={(isSaving) => {
                if (!isSaving) {
                    navigate("/");
                }
            }}
        />;
    }

    if (project === undefined) {
        return <Navigate to="/" />;
    }

    return <ProjectDetail key={project} project={project}/>;
};

type ProjectProps = { isCreating?: boolean };