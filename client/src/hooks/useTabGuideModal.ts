import { useEffect, useState } from "react";

/** Auto-opens once per browser while eligible (eg. a tab actually being viewed), tracked via localStorage. */
export function useTabGuideModal(storageKey: string, isEligible: boolean) {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (!isEligible) {
            return;
        }
        try {
            if (localStorage.getItem(storageKey) === "true") {
                return;
            }
            localStorage.setItem(storageKey, "true");
        } catch {
            // Storage unavailable - opens anyway, and will just ask again next visit
        }
        setIsOpen(true);
    }, [isEligible, storageKey]);

    return { isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) };
}
