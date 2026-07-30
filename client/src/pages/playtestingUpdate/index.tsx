import { Navigate, useParams } from "react-router-dom";
import { parseParamNumber } from "../../utils";
import PlaytestingUpdateDetail from "./playtestingUpdateDetail";

export default function PlaytestingUpdate() {
    const params = useParams();

    const project = parseParamNumber(params.project);
    const version = parseParamNumber(params.version);

    if (project === undefined || version === undefined) {
        return <Navigate to="/" />;
    }

    return <PlaytestingUpdateDetail project={project} version={version} />;
}
