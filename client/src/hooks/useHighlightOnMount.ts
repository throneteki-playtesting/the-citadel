import { useRef, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function useHighlightOnMount<T extends HTMLElement>(targetId: string) {
    const { state } = useLocation();
    const ref = useRef<T | null>(null);
    const [isHighlighted, setIsHighlighted] = useState(false);

    useEffect(() => {
        if (state?.highlight !== targetId || !ref.current) return;

        ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
        setIsHighlighted(true);

        const timer = setTimeout(() => setIsHighlighted(false), 2000);
        return () => clearTimeout(timer);
    }, [state, targetId]);

    return { ref: ref as React.RefObject<T>, isHighlighted };
}