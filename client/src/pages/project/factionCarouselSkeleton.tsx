import { Skeleton } from "@heroui/react";
import SlotSkeleton from "../../components/slots/slotSkeleton";

// One card of a carousel at its loaded size - a plot lies on its side at the same height's worth of width
const CAROUSEL_CARD_CLASS = "h-64 sm:h-72 md:h-80 aspect-[240/333] rounded-xl";
const CAROUSEL_PLOT_CLASS = "w-64 sm:w-72 md:w-80 aspect-[333/240] rounded-xl";

/** A card of a carousel as it waits - in its slot's frame (the same frame the drafting board's skeleton draws) for
 *  anyone who can read slots, or the bare card for anyone who can't */
export function CarouselCardSkeleton({ isFramed, isPlot = false }: { isFramed: boolean; isPlot?: boolean }) {
    const cardClassName = isPlot ? CAROUSEL_PLOT_CLASS : CAROUSEL_CARD_CLASS;
    return isFramed ? (
        <SlotSkeleton cardClassName={cardClassName} />
    ) : (
        <Skeleton className={`${cardClassName} shrink-0`} />
    );
}

// A faction's carousel while it loads - its name and tested share along the top, its cards running off the edge
export default function FactionCarouselSkeleton({ count, isFramed }: FactionCarouselSkeletonProps) {
    return (
        <div className="relative border border-content3 bg-content1 overflow-hidden">
            <div className="relative flex h-20 items-center">
                <div className="p-4 grow">
                    <Skeleton className="w-48 max-w-full h-8 rounded-md" />
                </div>
                <div className="py-4 px-2">
                    <Skeleton className="w-28 h-7 rounded-md" />
                </div>
            </div>
            <div className="w-full min-h-64 sm:min-h-72 md:min-h-80 flex overflow-hidden gap-2">
                {[...Array(count)].map((_, i) => (
                    <CarouselCardSkeleton key={i} isFramed={isFramed} />
                ))}
            </div>
        </div>
    );
}

type FactionCarouselSkeletonProps = {
    count: number;
    /** Its cards will sit in their slots' frames, so the skeleton holds the room those take too */
    isFramed: boolean;
};
