import { Skeleton } from "@heroui/react";

// The page's own shape while it loads - header and actions, the progress strip, the tabs, then the version stack
// beside its decks - so it reads as the page arriving rather than as one block standing in for all of it
export default function CardDetailSkeleton() {
    return (
        <div className="space-y-2">
            <div className="px-4 md:px-0 flex flex-col sm:flex-row gap-3">
                <div className="flex-1 flex flex-col gap-2">
                    <Skeleton className="h-5 w-40 rounded-md" />
                    <Skeleton className="h-9 w-64 max-w-full rounded-md" />
                    <Skeleton className="h-6 w-48 rounded-md" />
                </div>
                <div className="flex gap-2 self-end sm:self-start">
                    <Skeleton className="h-10 w-28 rounded-medium" />
                    <Skeleton className="h-10 w-10 rounded-medium" />
                </div>
            </div>
            <Skeleton className="h-12 w-full rounded-md" />
            <div className="flex gap-4 px-2">
                <Skeleton className="h-8 w-28 rounded-md" />
                <Skeleton className="h-8 w-20 rounded-md" />
            </div>
            <div className="flex flex-col md:flex-row gap-2">
                <div className="flex flex-col items-center gap-2 md:w-80">
                    <Skeleton className="h-8 w-full rounded-lg" />
                    <Skeleton className="w-64 aspect-[240/333] rounded-xl" />
                </div>
                <Skeleton className="flex-1 min-h-64 rounded-md" />
            </div>
        </div>
    );
}
