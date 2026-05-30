import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import ReviewForm from "./reviewForm";
import { usePageTitle } from "../../api/hooks";

const SubmitReview = () => {
    const [searchParams] = useSearchParams();
    usePageTitle("Submit Review");

    const parseNumber = (value: string | null) => {
        if (value) {
            const parsed = parseInt(value);
            if (!isNaN(parsed)) {
                return parsed;
            }
        }
        return undefined;
    };

    const { project, number } = useMemo(() => ({
        project: parseNumber(searchParams.get("project")),
        number: parseNumber(searchParams.get("number"))
    }), [searchParams]);

    return (
        <div className="flex justify-center">
            <ReviewForm review={{ project, number }}/>
        </div>
    );
};

export default SubmitReview;