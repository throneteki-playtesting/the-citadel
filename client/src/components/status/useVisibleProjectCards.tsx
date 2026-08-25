import { useMemo } from "react";
import { pickVisibleCards } from "common/models/cards";
import { useGetCardsQuery } from "../../api";

/** One card per number in the project - its released-latest, else draft, else plain latest, matching cardVersionRank */
export function useVisibleProjectCards(project: number) {
    const { data: latestData, isLoading: isLoadingLatest } = useGetCardsQuery({ filter: { project, latest: true } });
    const { data: draftData, isLoading: isLoadingDraft } = useGetCardsQuery({ filter: { project, draft: true } });

    const cards = useMemo(
        () => pickVisibleCards([...(latestData?.items ?? []), ...(draftData?.items ?? [])]),
        [latestData?.items, draftData?.items]
    );

    return { cards, isLoading: isLoadingLatest || isLoadingDraft };
}
