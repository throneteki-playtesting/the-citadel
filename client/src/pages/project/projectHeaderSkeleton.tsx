import { Skeleton } from "@heroui/react";

// The project header's lines as they sit once loaded - the small label run above the name, and the name itself
export default function ProjectHeaderSkeleton() {
    return (
        <div className="flex flex-col gap-2 px-4 md:px-0">
            <div className="flex items-start justify-between gap-2">
                <Skeleton className="h-4 w-56 rounded-lg" />
                <Skeleton className="size-8 rounded-full" />
            </div>
            <Skeleton className="h-9 w-72 max-w-full rounded-lg sm:h-10" />
        </div>
    );
}
