import { useGetPlaytestingUpdatesQuery } from "../../api";
import Reveal from "../../components/reveal";
import { Skeleton } from "@heroui/react";
import SectionTitle from "../../components/sectionTitle";
import PlaytestingUpdateMiniCard from "../../components/playtestingUpdateMiniCard";

export default function RecentPlaytestingUpdates() {
    const items = 3;
    const { data, isLoading } = useGetPlaytestingUpdatesQuery({
        orderBy: { updated: "desc" },
        page: 1,
        perPage: items
    });

    // The title stands from the start, so only the list itself is waiting - and fades in over its skeleton
    return (
        <div className="space-y-2">
            <SectionTitle size="sm" indent="xs">
                Recent PT Updates
            </SectionTitle>
            <Reveal
                key={isLoading ? "loading" : "loaded"}
                direction={null}
                className="bg-content1 border border-content3 divide-y-1 divide-content3"
            >
                {isLoading ? (
                    <div className="p-4 space-y-1">
                        <div className="min-w-0 space-y-1">
                            <Skeleton className="w-32 h-6 rounded-sm" />
                            <Skeleton className="w-64 h-4 rounded-sm" />
                        </div>
                        <Skeleton className="w-full h-32 rounded-sm" />
                    </div>
                ) : (
                    data?.items.map((pu) => (
                        <PlaytestingUpdateMiniCard key={`${pu.project}|${pu.version}`} playtestingUpdate={pu} />
                    ))
                )}
            </Reveal>
        </div>
    );
}
