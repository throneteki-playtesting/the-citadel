import { createContext } from "react";

/** Told when a zoomed card opens and closes. A modal around it reads a press on the zoom's backdrop as one outside
 *  itself, and uses this to hold off dismissing until the zoom has closed. */
export const ZoomGuardContext = createContext<(isZoomed: boolean) => void>(() => undefined);
