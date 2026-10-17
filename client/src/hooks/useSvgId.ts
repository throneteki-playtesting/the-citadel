import { useId } from "react";

// useId's colons are legal in an id but not safe inside url(#...)
export function useSvgId(prefix: string) {
    return `${prefix}-${useId().replace(/:/g, "")}`;
}
