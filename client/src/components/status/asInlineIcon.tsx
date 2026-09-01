import { ReactNode } from "react";

// A status icon is sized for BaseStatus's own dedicated button (eg. size="xl"); reusing it elsewhere
// (a dropdown item alongside other, ambient-sized icons) needs it reset back to inherited size
export function asInlineIcon(icon: ReactNode) {
    return <span className="[&_svg]:!text-[1em]">{icon}</span>;
}
