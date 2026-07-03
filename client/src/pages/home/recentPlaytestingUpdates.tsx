import { useGetPlaytestingUpdatesQuery } from "../../api";
import { Skeleton } from "@heroui/react";
import SectionTitle from "../../components/sectionTitle";
import PlaytestingUpdateMiniCard from "../../components/playtestingUpdateMiniCard";

export default function RecentPlaytestingUpdates() {
    const items = 3;
    const { data, isLoading } = useGetPlaytestingUpdatesQuery({ orderBy: { updated: "desc" }, page: 1, perPage: items });

    if (isLoading) {
        return (
            <div className="p-4 space-y-1 transition-colors">
                <div className="flex gap-3">
                    <div className="min-w-0 space-y-1">
                        <Skeleton className="w-32 h-6 rounded-sm"/>
                        <Skeleton className="w-64 h-4 rounded-sm"/>
                    </div>
                </div>
                <Skeleton className="w-full h-32 rounded-sm"/>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <SectionTitle size="sm" indent="xs">
                Recent PT Updates
            </SectionTitle>
            <div className="bg-content1 border border-content3 divide-y-1 divide-content3">
                {data?.items.map((pu) => (
                    <PlaytestingUpdateMiniCard key={`${pu.project}|${pu.version}`} playtestingUpdate={pu} />
                ))}
            </div>
        </div>
    );
}
