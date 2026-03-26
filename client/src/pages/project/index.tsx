import { Navigate, useParams } from "react-router-dom";
import ProjectDetail from "./projectDetail";
import { parseParamNumber } from "../../utils";

const Project = ({ isCreating = false }: ProjectProps) => {
    const { number } = useParams();

    const project = parseParamNumber(number);

    if (!isCreating && !project) {
        return <Navigate to="/" replace />;
    }
    return (
        <ProjectDetail key={project} project={project}/>
    );
};

type ProjectProps = { isCreating?: boolean };

export default Project;