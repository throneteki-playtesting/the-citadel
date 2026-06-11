import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import ReviewForm from "./reviewForm";
import { parseParamNumber } from "../../utils";
import { useGetCardQuery } from "../../api";
import usePageTitle from "../../hooks/usePageTitle";

export default function SubmitReview() {
    const [searchParams] = useSearchParams();
    usePageTitle("Submit Review");

    const { project, number } = useMemo(() => ({
        project: parseParamNumber(searchParams.get("project")),
        number: parseParamNumber(searchParams.get("number"))
    }), [searchParams]);

    const { data: card } = useGetCardQuery({ project: project!, number: number!, version: "latest" }, { skip: !project || !number });

    return <ReviewForm card={card} />;
};