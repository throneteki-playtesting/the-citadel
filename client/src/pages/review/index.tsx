import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import ReviewForm from "./reviewForm";
import { parseParamNumber } from "../../utils";
import { useGetCardQuery, useGetReviewQuery } from "../../api";
import usePageTitle from "../../hooks/usePageTitle";
import { useAuth } from "../../hooks/useAuth";
import { hasPermission, SemanticVersion } from "common/utils";
import Permission from "common/models/permissions";
import AccessDenied from "../../components/accessDenied";

export default function SubmitReview() {
    const [searchParams] = useSearchParams();
    usePageTitle("Submit Review");

    const { user, isLoading: isAuthLoading } = useAuth();

    const { project, number, version, reviewerParam } = useMemo(
        () => ({
            project: parseParamNumber(searchParams.get("project")),
            number: parseParamNumber(searchParams.get("number")),
            version: searchParams.get("version") as SemanticVersion | null,
            reviewerParam: searchParams.get("reviewer")
        }),
        [searchParams]
    );

    const isOwnReviewer = !reviewerParam || reviewerParam === user?.discordId;
    const reviewer = reviewerParam ?? user?.discordId;
    // Targeting someone else's review, or a specific (potentially outdated) version, is edit-only territory
    const requiresEditPermission = !isOwnReviewer || !!version;
    const canEdit = hasPermission(user, Permission.EDIT_REVIEWS);

    const { data: card, isLoading: isCardLoading } = useGetCardQuery(
        { project: project!, number: number!, version: version ?? "latest" },
        { skip: !project || !number }
    );

    // Only need to confirm an existing review when targeting someone else's - never create a review on their behalf
    const {
        data: existingReview,
        isLoading: isReviewLoading,
        isFetching: isReviewFetching
    } = useGetReviewQuery(
        { project: project!, number: number!, version: card?.version as SemanticVersion, reviewer: reviewer! },
        { skip: !project || !number || !card || !reviewer || isOwnReviewer }
    );

    if (isAuthLoading || (requiresEditPermission && !canEdit)) {
        if (isAuthLoading) {
            return null;
        }
        return <AccessDenied />;
    }

    if (!isOwnReviewer) {
        if (isCardLoading || isReviewLoading || isReviewFetching) {
            return null;
        }
        if (!existingReview) {
            return <AccessDenied />;
        }
    }

    return <ReviewForm card={card} reviewer={reviewer} />;
}
