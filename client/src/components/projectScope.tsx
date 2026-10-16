import { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { skipToken } from "@reduxjs/toolkit/query";
import { useGetProjectQuery } from "../api";
import { ProjectScopeContext } from "../hooks/useProjectScope";
import { parseParamNumber } from "../utils";

// The project a route sits under (its :project param), so permission checks beneath it can honour ownership of it
export default function ProjectScope({ children }: { children: ReactNode }) {
    const number = parseParamNumber(useParams().project);
    const { data: project, isLoading } = useGetProjectQuery(number === undefined ? skipToken : { number });

    return <ProjectScopeContext.Provider value={{ project, isLoading }}>{children}</ProjectScopeContext.Provider>;
}
