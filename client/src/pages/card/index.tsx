import { Navigate, useParams } from "react-router-dom";
import CardDetail from "./cardDetail";
import ScopedSearchParamsProvider from "../../components/scopedSearchParamsProvider";
import { parseParamNumber } from "../../utils";

const Card = () => {
    const params = useParams();

    const project = parseParamNumber(params.project);
    const number = parseParamNumber(params.number);

    if (project === undefined || number === undefined) {
        return <Navigate to="/" />;
    }

    // The refinement tab owns a slice of the url the same way the project's tabs do, and the hook it uses
    // insists on a provider rather than quietly doing nothing without one
    return (
        <ScopedSearchParamsProvider>
            <CardDetail key={`${project}|${number}`} project={project} number={number} />
        </ScopedSearchParamsProvider>
    );
};

export default Card;
