import { useMemo } from "react";
import { tagKinds } from "common/designGuidelines/suggestionTags";
import { useGetSettingsQuery } from "../api";

const EMPTY: never[] = [];

/** Which vocabulary each tag in use belongs to - the colour of a tag is looked up from this */
export function useTagKinds() {
    const { data } = useGetSettingsQuery("suggestions");
    const rewardOptions = data?.rewardOptions ?? EMPTY;
    const downsideOptions = data?.downsideOptions ?? EMPTY;
    return useMemo(() => tagKinds(rewardOptions, downsideOptions), [rewardOptions, downsideOptions]);
}
