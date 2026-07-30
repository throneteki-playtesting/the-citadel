import { useGetGlobalStatsQuery } from "../../api";
import { ReactNode } from "react";
import { Skeleton } from "@heroui/react";
import Permission from "common/models/permissions";
import { changeTypeClasses } from "../../constants";
import { ChangeType } from "common/types";
import classNames from "classnames";
import PermissionGate from "../../components/permissionGate";
import StatsGrid from "../../components/statsGrid";
import { useTagManagerOverrides } from "../../hooks/useTagManagerOverrides";

const CARD_CHANGE_DAY_RANGE = 7;
const ACTIVE_USER_DAY_RANGE = 14;

export default function StatCards() {
    useTagManagerOverrides({ autoRefresh: true });

    return (
        <PermissionGate requires={Permission.READ_STATS_GLOBAL}>
            <StatsGrid className="border border-content3 drop-shadow-lg">
                <CardChangesStat />
                <ActiveUsersStat />
                <CardsInTestingStat />
                <ReviewsStat />
            </StatsGrid>
        </PermissionGate>
    );
}

function CardChangesStat() {
    const { data, isLoading } = useGetGlobalStatsQuery();

    const footer = (
        <div className="flex gap-0.5 flex-wrap">
            {data &&
                Object.entries(data.cardChanges.byNoteType)
                    .filter(([, count]) => count > 0)
                    .map(([type, count]) => (
                        <div
                            key={type}
                            className={classNames(
                                "bg-content3/50 px-2 rounded-full font-sans opacity-50 border-1",
                                changeTypeClasses[type as ChangeType]
                            )}
                        >
                            {count} {type}
                        </div>
                    ))}
        </div>
    );

    return (
        <StatCard
            label={`Card Changes · ${CARD_CHANGE_DAY_RANGE} days`}
            value={data?.cardChanges.total}
            footer={footer}
            isLoading={isLoading}
        />
    );
}

function ActiveUsersStat() {
    const { data, isLoading } = useGetGlobalStatsQuery();

    return (
        <StatCard
            label="Active Users"
            value={data?.activeUsers.total}
            footer={`in the last ${ACTIVE_USER_DAY_RANGE} days`}
            isLoading={isLoading}
        />
    );
}

function CardsInTestingStat() {
    const { data, isLoading } = useGetGlobalStatsQuery();

    return (
        <StatCard
            label="Cards in testing"
            value={data?.cardsInTesting.total}
            footer={
                data &&
                `across ${data.cardsInTesting.projectCount} project${data.cardsInTesting.projectCount !== 1 ? "s" : ""}`
            }
            isLoading={isLoading}
        />
    );
}

function ReviewsStat() {
    const { data, isLoading } = useGetGlobalStatsQuery();

    return (
        <StatCard
            label="Reviews"
            value={data?.reviews.total}
            footer={data && `across ${data.reviews.playtesterCount} playtesters`}
            isLoading={isLoading}
        />
    );
}

function StatCard({ label, value, footer, isLoading = false }: StatCardProps) {
    if (isLoading) {
        return (
            <div className="bg-content2 px-5 py-5 border-b-2 space-y-2">
                <Skeleton className="h-4 w-32 rounded-sm" />
                <Skeleton className="h-12 w-28 rounded-sm" />
                <Skeleton className="h-4 w-42 rounded-sm" />
            </div>
        );
    }
    return (
        <div className="bg-content2 px-5 py-5">
            <div className="text-xs font-cinzel tracking-wide uppercase text-foreground/50">{label}</div>
            <div className="text-5xl font-sans text-foreground mt-2 leading-none">{value ?? "-"}</div>
            {footer && <div className="text-sm font-serif italic text-foreground/50 mt-2">{footer}</div>}
        </div>
    );
}
type StatCardProps = {
    label: string;
    value?: ReactNode;
    footer?: ReactNode;
    isLoading?: boolean;
};
