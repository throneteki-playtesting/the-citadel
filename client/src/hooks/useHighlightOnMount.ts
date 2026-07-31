import { useRef, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function useHighlightOnMount<T extends HTMLElement>(targetId: string) {
    const { pathname, search, hash, state } = useLocation();
    const navigate = useNavigate();
    const ref = useRef<T | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isHighlighted, setIsHighlighted] = useState(false);

    useEffect(() => {
        if (state?.highlight !== targetId || !ref.current) {
            return;
        }

        ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
        setIsHighlighted(true);

        timerRef.current = setTimeout(() => setIsHighlighted(false), 2000);
        const remaining = { ...state };
        delete remaining.highlight;
        navigate({ pathname, search, hash }, { replace: true, state: remaining });
    }, [state, targetId, navigate, pathname, search, hash]);

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, []);

    return { ref: ref as React.RefObject<T>, isHighlighted };
}
