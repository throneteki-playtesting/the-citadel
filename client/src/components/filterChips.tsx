import { ReactNode } from "react";
import { Chip, ScrollShadow } from "@heroui/react";

/**
 * One axis of a list's filters. The chips scroll sideways on a phone rather than wrapping, since a filter
 * row growing taller pushes the list it filters off the screen; the ScrollShadow's faded edge says there is more.
 */
export function FilterRow({ label, children }: { label?: string; children: ReactNode }) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            {label && (
                <span className="sm:w-16 shrink-0 sm:text-right text-[0.65rem] uppercase tracking-widest text-foreground/40">
                    {label}
                </span>
            )}
            <ScrollShadow
                orientation="horizontal"
                hideScrollBar
                className="flex gap-1.5 py-0.5 sm:flex-wrap sm:overflow-visible"
            >
                {children}
            </ScrollShadow>
        </div>
    );
}

/** One filter. Nothing selected means everything, so there is deliberately no "All" chip to press */
export function FilterChip({ label, count, isActive, startContent, onPress }: FilterChipProps) {
    return (
        <Chip
            as="button"
            size="sm"
            variant={isActive ? "solid" : "bordered"}
            color={isActive ? "primary" : "default"}
            className="shrink-0 cursor-pointer"
            startContent={startContent}
            onClick={onPress}
            endContent={<span className="px-1.5 text-xs tabular-nums rounded-full bg-foreground/10 ml-1">{count}</span>}
        >
            {label}
        </Chip>
    );
}

type FilterChipProps = {
    label: string;
    count: number;
    isActive: boolean;
    /** An icon ahead of the label, where the filter has one worth showing (eg. an inquiry's severity) */
    startContent?: ReactNode;
    onPress: () => void;
};
