import { memo, useMemo } from "react";
import { Faction } from "common/models/cards";
import { DRAFT_EXPANDED_PARAM } from "../../../constants";
import { useSearchParamsScope } from "../../../hooks/useSearchParamsScope";
import { expandedParam, useExpandedFactions } from "./expandedFactionsStore";

// Keeps the url naming the expanded factions - apart from the board, so a toggle never redraws it
const ExpandedFactionsParam = memo(function ExpandedFactionsParam({ factions }: ExpandedFactionsParamProps) {
    const expanded = useExpandedFactions();
    const params = useMemo(() => ({ [DRAFT_EXPANDED_PARAM]: expandedParam(expanded, factions) }), [expanded, factions]);
    useSearchParamsScope("expanded", true, params);
    return null;
});

export default ExpandedFactionsParam;

type ExpandedFactionsParamProps = {
    /** The factions on show, in a stable array */
    factions: Faction[];
};
