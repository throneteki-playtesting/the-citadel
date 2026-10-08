import { createContext, useContext } from "react";

export type DraftPoolHostValue = { host: HTMLElement | null; setHost: (element: HTMLElement | null) => void };

export const DraftPoolHostContext = createContext<DraftPoolHostValue | undefined>(undefined);

export function useDraftPoolHost() {
    return useContext(DraftPoolHostContext)?.host ?? null;
}
