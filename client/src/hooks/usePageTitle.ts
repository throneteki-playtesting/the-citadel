import { useEffect } from "react";

export default function usePageTitle(title?: string) {
    useEffect(() => {
        document.title = title ? `Citadel - ${title}` : "Citadel";
        return () => {
            document.title = "Citadel";
        }; // reset on unmount
    }, [title]);
}
