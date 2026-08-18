import { createContext, useContext } from "react";

/** Whether the surrounding `SlidingPages` page is on show. True by default, outside one */
export const PageActiveContext = createContext(true);

export function useIsPageActive() {
    return useContext(PageActiveContext);
}
