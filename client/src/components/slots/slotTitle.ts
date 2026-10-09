import { useGetProjectQuery } from "../../api";

export const slotTitle = (projectName: string | undefined, slot: number, action?: string) =>
    `${projectName} #${slot}${action ? ` · ${action}` : ""}`;

export function useSlotTitle(project: number, slot: number, action?: string) {
    const { data } = useGetProjectQuery({ number: project });
    return slotTitle(data?.name, slot, action);
}
