import { useGetSlotsQuery } from "../../../api";

// Subscribes to the project-wide slots query the releases page already issues, which RTK Query
// dedupes - so a capsule gets its slot without a fetch, or a slot map threaded through the dnd tree
export function useCapsuleSlot(project: number, number: number, skip: boolean) {
    const { data } = useGetSlotsQuery({ project }, { skip });
    return data?.items.find((slot) => slot.number === number);
}
