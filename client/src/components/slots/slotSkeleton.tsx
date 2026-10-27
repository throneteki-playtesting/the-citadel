import { CSSProperties } from "react";
import { Skeleton } from "@heroui/react";
import classNames from "classnames";

// A slot's frame as SlotFrame draws it - the number and menu along the top, its card beneath - while it loads. Shared
// by the drafting board, whose frames size themselves to hold a pile, and the project page, whose frames hold the one
// card at a carousel's size, so the two read as the same frame whichever page it is waiting on.
export default function SlotSkeleton({ className, style, cardClassName = "w-full grow" }: SlotSkeletonProps) {
    return (
        <div
            className={classNames(
                "flex shrink-0 flex-col gap-1 rounded-lg border border-content3 bg-content2/40 p-1",
                className
            )}
            style={style}
        >
            <div className="flex h-6 items-center justify-between pl-1">
                <Skeleton className="h-3 w-8 rounded-md" />
                <Skeleton className="size-5 rounded-full" />
            </div>
            <Skeleton className={classNames("rounded-md", cardClassName)} />
        </div>
    );
}

type SlotSkeletonProps = {
    className?: string;
    style?: CSSProperties;
    /** The card's own size within the frame - by default it fills whatever the frame leaves */
    cardClassName?: string;
};
