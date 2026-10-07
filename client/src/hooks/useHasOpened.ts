import { useState } from "react";

// Whether `isOpen` has ever been true - for mounting what sits behind a toggle only once it is first needed
export function useHasOpened(isOpen: boolean) {
    const [hasOpened, setHasOpened] = useState(isOpen);
    if (isOpen && !hasOpened) {
        setHasOpened(true);
    }
    return hasOpened;
}
