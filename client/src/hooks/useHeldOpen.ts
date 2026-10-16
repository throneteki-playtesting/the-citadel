import { useEffect, useState } from "react";

// True while active, and for a moment after - for what must outlast the click which ends it
export function useHeldOpen(isActive: boolean, holdMs: number) {
    const [isHeld, setIsHeld] = useState(false);
    useEffect(() => {
        if (isActive) {
            setIsHeld(true);
            return;
        }
        const timer = setTimeout(() => setIsHeld(false), holdMs);
        return () => clearTimeout(timer);
    }, [isActive, holdMs]);
    return isActive || isHeld;
}
