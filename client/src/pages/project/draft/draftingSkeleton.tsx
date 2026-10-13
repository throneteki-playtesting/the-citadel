import { Skeleton } from "@heroui/react";
import classNames from "classnames";
import { DRAFT_ROW_HEIGHT_CLASS, DRAFT_SLOT_VARIABLES_CLASS } from "../../../constants";
import { frameShape } from "./slotShape";

const ROWS = [0, 1, 2];
// Enough to run past the edge at any width, as a row of slots does
const SLOTS_PER_ROW = [0, 1, 2, 3, 4, 5];

// A faction's row as it stands once loaded - its bordered box, a title and count, and a scroller of slot frames
function FactionRowSkeleton() {
    return (
        <div className="relative overflow-hidden border border-content3">
            <div className="flex h-20 items-center justify-between gap-4 p-4">
                <Skeleton className="h-8 w-40 rounded-lg sm:h-9 sm:w-52" />
                <Skeleton className="h-4 w-20 rounded-lg" />
            </div>
            <div
                className={classNames(
                    "flex w-full gap-2 overflow-hidden p-2",
                    DRAFT_ROW_HEIGHT_CLASS,
                    DRAFT_SLOT_VARIABLES_CLASS
                )}
            >
                {SLOTS_PER_ROW.map((slot) => (
                    <div
                        key={slot}
                        className="flex shrink-0 flex-col gap-1 rounded-lg border border-content3 bg-content2/40 p-1"
                        style={frameShape(false)}
                    >
                        <div className="flex h-6 items-center justify-between pl-1">
                            <Skeleton className="h-3 w-8 rounded-md" />
                            <Skeleton className="size-5 rounded-full" />
                        </div>
                        <Skeleton className="w-full grow rounded-md" />
                    </div>
                ))}
            </div>
        </div>
    );
}

// The draft pool's button, where it sits in the project header - at the size of the loaded one
export function DraftPoolSkeleton() {
    return <Skeleton className="h-full min-h-16 w-full rounded-large" />;
}

// The drafting page's body while its slots and cards load - the faction rows, each with its slot frames
export default function DraftingSkeleton() {
    return (
        <div className="flex flex-col gap-2">
            {ROWS.map((row) => (
                <FactionRowSkeleton key={row} />
            ))}
        </div>
    );
}
