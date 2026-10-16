import { ReactNode, useContext, useMemo, useState } from "react";
import { DraftPoolHostContext } from "./useDraftPoolHost";

// Joins the place the draft pool is shown, in the project header, to the draft page which draws it - it has to
// be drawn from inside the draft page's drag area, wherever on the page it appears
export function DraftPoolHostProvider({ children }: { children: ReactNode }) {
    const [host, setHost] = useState<HTMLElement | null>(null);
    const value = useMemo(() => ({ host, setHost }), [host]);
    return <DraftPoolHostContext.Provider value={value}>{children}</DraftPoolHostContext.Provider>;
}

/** Where the draft pool appears - empty, and so taking no room, until the draft page draws it there */
export function DraftPoolHost({ className }: { className?: string }) {
    const context = useContext(DraftPoolHostContext);
    return <div ref={context?.setHost} className={className} />;
}
