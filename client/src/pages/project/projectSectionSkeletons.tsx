import { Skeleton } from "@heroui/react";
import { factions } from "common/models/cards";

// What each of the Development tab's sections draws while it waits on its own data - inside the fade the section arrives
// with, so the section appears once and its content then takes the skeleton's place

/** One of the Development tab's stats while its figure loads */
export function StatCardSkeleton() {
    return (
        <div className="bg-content2/50 px-5 py-5 border-b-2 space-y-2">
            <Skeleton className="h-4 w-32 rounded-sm" />
            <Skeleton className="h-12 w-28 rounded-sm" />
            <Skeleton className="h-4 w-42 rounded-sm" />
        </div>
    );
}

/** The newest playtesting update, inside the panel it will fill */
export function PlaytestingUpdatesSkeleton() {
    return (
        <div className="p-4 space-y-1">
            <div className="min-w-0 space-y-1">
                <Skeleton className="w-32 h-6 rounded-sm" />
                <Skeleton className="w-64 max-w-full h-4 rounded-sm" />
            </div>
            <Skeleton className="w-full h-22 rounded-sm" />
        </div>
    );
}

/** A row for each faction, inside the Playtesting Focus panel */
export function PlaytestingFocusSkeleton() {
    return (
        <div className="divide-y divide-content3">
            {factions.map((faction) => (
                <div key={faction} className="flex items-center gap-2 p-2">
                    <Skeleton className="w-32 h-5 rounded-sm" />
                    <Skeleton className="ml-auto w-24 h-4 rounded-sm" />
                </div>
            ))}
        </div>
    );
}
