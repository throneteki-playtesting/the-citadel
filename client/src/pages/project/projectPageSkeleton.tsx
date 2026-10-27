import { Skeleton } from "@heroui/react";
import { factions } from "common/models/cards";
import Permission from "common/models/permissions";
import SectionTitle from "../../components/sectionTitle";
import StatsGrid from "../../components/statsGrid";
import { hasPermission } from "common/utils";
import { useScopedUser } from "../../hooks/useScopedUser";
import ProjectHeaderSkeleton from "./projectHeaderSkeleton";
import FactionCarouselSkeleton from "./factionCarouselSkeleton";

// Kept apart from the page itself, with nothing heavy imported, so the route can show it while the page's own code is
// still arriving - and the page shows the very same pieces while its queries load, so nothing is swapped between the
// two. Each piece is also what its section draws while waiting on its own data, which is what keeps them alike.

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

/** The cards' toolbar - search and Advanced, sort, and the view switch */
export function ProjectCardsToolbarSkeleton() {
    return (
        <div className="flex flex-col md:flex-row md:items-center gap-2">
            <SectionTitle className="md:flex-1">Project Cards</SectionTitle>
            <div className="flex flex-wrap justify-end items-center gap-2">
                <Skeleton className="h-8 w-48 sm:w-72 rounded-small" />
                <Skeleton className="h-8 w-44 rounded-small" />
                <Skeleton className="size-8 rounded-small" />
            </div>
        </div>
    );
}

// The Development tab as a whole, before its project is known - so its carousels are a guess at a typical few
const GUESSED_CAROUSELS = [7, 7, 7];

/** The project page while anything at all is still on its way: its header, its tabs, then the Development tab */
export default function ProjectPageSkeleton() {
    // Drawn before the user is known too - a section is held for then, rather than left out and pushed in after
    const { user } = useScopedUser();
    const can = (...permissions: Permission[]) => !user || hasPermission(user, ...permissions);
    const canReadSlots = can(Permission.READ_SLOTS);
    return (
        <div className="space-y-2">
            <ProjectHeaderSkeleton />
            <div className="flex gap-6 px-3 h-12 items-center">
                <Skeleton className="h-6 w-28 rounded-md" />
                <Skeleton className="h-6 w-20 rounded-md" />
                <Skeleton className="h-6 w-24 rounded-md" />
            </div>
            {/* The tab panel's own padding */}
            <div className="px-1 pt-1">
                <StatsGrid className="border border-content3 drop-shadow-lg">
                    <StatCardSkeleton />
                    <StatCardSkeleton />
                    <StatCardSkeleton />
                    <StatCardSkeleton />
                </StatsGrid>
                <div className="flex flex-col md:flex-row gap-2 md:gap-4 mt-2">
                    {can(Permission.READ_PLAYTESTING_UPDATES) && (
                        <div className="space-y-2 md:flex-1 min-w-0">
                            <SectionTitle>Playtesting Updates</SectionTitle>
                            <div className="bg-content1 border border-content3">
                                <PlaytestingUpdatesSkeleton />
                            </div>
                        </div>
                    )}
                    {can(Permission.READ_REVIEWS, Permission.READ_CARDS) && (
                        <div className="flex flex-col gap-2 md:flex-1 min-w-0">
                            <SectionTitle>Playtesting Focus</SectionTitle>
                            {/* Held to the Updates panel's height from md up, as the loaded list is */}
                            <div className="md:relative md:flex-1 md:min-h-32">
                                <div className="bg-content1 border border-content3 overflow-hidden md:absolute md:inset-0">
                                    <PlaytestingFocusSkeleton />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="mt-2 flex flex-col gap-2">
                    <ProjectCardsToolbarSkeleton />
                    {GUESSED_CAROUSELS.map((count, index) => (
                        <FactionCarouselSkeleton key={index} count={count} isFramed={canReadSlots} />
                    ))}
                </div>
            </div>
        </div>
    );
}
