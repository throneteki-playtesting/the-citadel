import { Skeleton } from "@heroui/react";

// The project header's lines as they sit once loaded - the small label run above the name with the header's actions
// beside it from sm up, then the name with the progress meter beside it (beneath it on a phone)
export default function ProjectHeaderSkeleton() {
    return (
        <div className="px-4 md:px-0 space-y-2 md:space-y-4">
            <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                    <Skeleton className="h-4 w-56 max-w-[60%] rounded-lg" />
                    {/* A phone has the actions in a floating button instead */}
                    <div className="hidden sm:flex items-center gap-1.5">
                        <Skeleton className="size-10 rounded-medium" />
                        <Skeleton className="size-10 rounded-medium" />
                        <Skeleton className="h-10 w-20 rounded-medium" />
                    </div>
                </div>
                <div className="flex items-end justify-between gap-6">
                    <Skeleton className="h-9 sm:h-10 w-72 max-w-full rounded-lg" />
                    <MeterSkeleton className="hidden md:flex w-64 shrink-0 pb-1" />
                </div>
            </div>
            <MeterSkeleton className="flex md:hidden" />
        </div>
    );
}

function MeterSkeleton({ className }: { className: string }) {
    return (
        <div className={`flex-col gap-2 ${className}`}>
            <div className="flex justify-between">
                <Skeleton className="h-4 w-32 rounded-md" />
                <Skeleton className="h-5 w-10 rounded-md" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
        </div>
    );
}
