import { useParams } from "react-router-dom";
import CardDetail from "./cardDetail";

const Card = () => {
    const { project: projectParam, number: numberParam } = useParams();

    if (!projectParam || !numberParam) {
        return <div>
            Project or number is invalid!
        </div>;
    }

    const project = parseInt(projectParam);
    const number = parseInt(numberParam);

    return (
        <CardDetail key={`${project}|${number}`} project={project} number={number}/>
    );
};

export default Card;