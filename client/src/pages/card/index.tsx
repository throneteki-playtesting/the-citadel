import { Navigate, useParams } from "react-router-dom";
import CardDetail from "./cardDetail";
import { parseParamNumber } from "../../utils";

const Card = () => {
    const params = useParams();

    const project = parseParamNumber(params.project);
    const number = parseParamNumber(params.number);

    if (project === undefined || number === undefined) {
        return <Navigate to="/" />;
    }

    return <CardDetail key={`${project}|${number}`} project={project} number={number}/>;
};

export default Card;