import { useEffect } from "react";

export default function usePageTitle(title?: string) {
    useEffect(() => {
        document.title = title ? `The Citadel - ${title}` : "The Citadel";
        return () => { document.title = "The Citadel"; }; // reset on unmount
    }, [title]);
}