import { createContext, useContext } from "react";

/**
 * Whether the surrounding page or tab panel is on show - provided by `SlidingPages` and by any tabs kept
 * mounted, since a hidden one still draws whatever it portals elsewhere. True by default, outside both.
 */
export const PageActiveContext = createContext(true);

export function useIsPageActive() {
    return useContext(PageActiveContext);
}
