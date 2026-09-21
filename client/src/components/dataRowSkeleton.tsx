import { ReactNode } from "react";
import { Skeleton } from "@heroui/react";

/** The accent-bar/progress-ring/name/edit-button shell shared by artwork and refinement row skeletons */
export default function DataRowSkeleton({ children }: { children: ReactNode }) {
    return (
        <div className="flex items-stretch gap-2 sm:gap-3 pr-1 sm:pr-2 rounded-md border border-content3 bg-content1 overflow-hidden">
            <Skeleton className="w-1.5 shrink-0 rounded-none" />
            <Skeleton className="size-10 shrink-0 self-center rounded-full" />
            <div className="flex-1 min-w-0 py-2 flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-1">
                <div className="sm:w-48 md:w-56 lg:w-72 shrink-0 min-w-0">
                    <Skeleton className="h-4 w-32 rounded-sm" />
                </div>
                {children}
            </div>
            <div className="shrink-0 self-center flex items-center gap-1">
                <Skeleton className="size-6 sm:size-8 rounded-md" />
            </div>
        </div>
    );
}
