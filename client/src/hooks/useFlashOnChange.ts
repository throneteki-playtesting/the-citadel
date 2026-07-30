import { useEffect, useRef, useState } from "react";

// Same timed ring-flash pattern as useHighlightOnMount, but driven by content changing rather than router state.
export default function useFlashOnChange<T>(value: T, duration = 2000) {
    const [isFlashing, setIsFlashing] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setIsFlashing(true);

        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => setIsFlashing(false), duration);

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [value, duration]);

    return isFlashing;
}
