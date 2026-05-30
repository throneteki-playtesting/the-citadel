import { useGetPlaytestingUpdatesQuery } from "../../api";
import { useMemo } from "react";
import { Skeleton } from "@heroui/react";
import PlaytestingUpdateCard from "../../components/playtestingUpdateCard";

export default function RecentPlaytestingUpdates() {
    const items = 3;
    const { data, isLoading } = useGetPlaytestingUpdatesQuery({ orderBy: { updated: "desc" }, page: 1, perPage: items });

    const content = useMemo(() => {
        if (isLoading) {
            const array = Array.from({ length: items });
            return array.map((_, index) => (
                <div key={index} className="p-4 space-y-1 transition-colors">
                    <div className="flex gap-3">
                        <div className="min-w-0 space-y-1">
                            <Skeleton className="w-32 h-6 rounded-sm"/>
                            <Skeleton className="w-64 h-4 rounded-sm"/>
                        </div>
                    </div>
                    <Skeleton className="w-full h-32 rounded-sm"/>
                </div>
            ));
        }
        return data?.items.map((pu) => (
            <PlaytestingUpdateCard key={`${pu.project}|${pu.version}`} playtestingUpdate={pu} />
        ));
    }, [data?.items, isLoading]);

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-4">
                <div className="h-px w-4 bg-primary/30" />
                <span className="font-cinzel text-sm uppercase tracking-widest text-primary">Recent PT Updates</span>
                <div className="h-px flex-1 bg-primary/30" />
            </div>
            <div className="bg-content1 border border-content3 divide-y divide-content3">
                {content}
            </div>
        </div>
    );
}

