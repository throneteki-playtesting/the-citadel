import { Skeleton } from "@heroui/react";
import classNames from "classnames";
import { DRAFT_SLOT_SIZE_CLASS } from "../../../constants";
import { frameShape } from "./slotShape";
import SlotSkeleton from "../../../components/slots/slotSkeleton";

const FACTIONS = [0, 1, 2];
// Two full rows at the widest, which also runs a collapsed row past the edge
const SLOTS = [0, 1, 2, 3, 4, 5, 6, 7];

function FactionSkeleton({ isExpanded }: { isExpanded: boolean }) {
    return (
        <div className="relative overflow-hidden border border-content3">
            <div className="flex h-20 items-center justify-between gap-4 p-4">
                <Skeleton className="h-8 w-40 rounded-lg sm:h-9 sm:w-52" />
                <Skeleton className="h-4 w-20 rounded-lg" />
            </div>
            <div className="p-2">
                <div
                    className={classNames(
                        "@container flex gap-2",
                        isExpanded ? "flex-wrap justify-center" : "overflow-hidden"
                    )}
                >
                    {SLOTS.map((slot) => (
                        <SlotSkeleton key={slot} className={DRAFT_SLOT_SIZE_CLASS} style={frameShape(false)} />
                    ))}
                </div>
            </div>
        </div>
    );
}

// The draft pool's button, where it sits in the project header - at the size of the loaded one
export function DraftPoolSkeleton() {
    return <Skeleton className="h-full min-h-16 w-full rounded-large" />;
}

// The drafting page's body while its slots and cards load, wrapped if any faction was left expanded
export default function DraftingSkeleton({ isExpanded }: { isExpanded: boolean }) {
    return (
        <div className="flex flex-col gap-2">
            {FACTIONS.map((faction) => (
                <FactionSkeleton key={faction} isExpanded={isExpanded} />
            ))}
        </div>
    );
}
