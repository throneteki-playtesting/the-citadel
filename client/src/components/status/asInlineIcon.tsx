import { ReactNode } from "react";

// A status icon is sized for BaseStatus's own dedicated button (eg. size="xl"); reusing it elsewhere
// (a dropdown item alongside other, ambient-sized icons) needs it reset back to inherited size - bar a corner badge,
// which is positioned over its icon and keeps its own smaller size
export function asInlineIcon(icon: ReactNode) {
    return <span className="[&_svg:not(.absolute)]:!text-[1em]">{icon}</span>;
}
