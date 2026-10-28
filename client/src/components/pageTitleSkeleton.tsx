import { Skeleton } from "@heroui/react";

/**
 * Every page's loading state before it can draw - while signing in, while its code arrives, and while the record it is
 * gated on loads. Only the title area most pages open with: a small line above, the title, a line beneath. Nothing
 * stands in for the rest, so when the page draws its sections fade in from nothing, once each, rather than a skeleton
 * of them being taken away and the same shapes fading back in.
 */
export default function PageTitleSkeleton() {
    return (
        <div className="flex flex-col gap-2 px-4 md:px-0" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-3 w-40 rounded-md" />
            <Skeleton className="h-9 sm:h-10 w-72 max-w-full rounded-lg" />
            <Skeleton className="h-4 w-56 max-w-[80%] rounded-md" />
        </div>
    );
}
