import { Skeleton } from "@heroui/react";

/** The title+chips header shared by a release block's skeleton, whether collapsed or full height */
export default function ReleaseHeaderSkeleton({ extraChip = false }: { extraChip?: boolean }) {
    return (
        <div className="flex items-center gap-2 px-4 py-3 bg-content2 border-b border-content3">
            <div className="flex-1 min-w-0 flex flex-col items-start gap-1">
                <Skeleton className="h-[1.125rem] w-40 rounded-sm" />
                <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-14 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                    {extraChip && <Skeleton className="h-5 w-24 rounded-full" />}
                </div>
            </div>
            <Skeleton className="size-8 shrink-0 rounded-md" />
        </div>
    );
}
