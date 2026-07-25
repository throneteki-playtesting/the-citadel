import { useGetCardsQuery, useGetProjectsQuery, useGetReviewsQuery, useGetUsersQuery } from "../../api";
import { ReactNode, useMemo } from "react";
import { NoteType } from "common/models/cards";
import { daysFromNow } from "../../utils";
import { Skeleton } from "@heroui/react";
import Permission from "common/models/permissions";
import { changeTypeClasses } from "../../constants";
import { ChangeType } from "common/types";
import classNames from "classnames";
import PermissionGate from "../../components/permissionGate";
import StatsGrid from "../../components/statsGrid";
import { useTagManagerOverrides } from "../../hooks/useTagManagerOverrides";

// TODO: Create a "statistics" endpoint in server, and call that rather than gathering data on front-end. For now, this is sufficient
// Should also include new "statistics" related permissions, as a user could see total stats, but not the data creating those stats
// Note: Also add scoped statistics, like project stats & card stats

export default function StatCards() {
    useTagManagerOverrides({ autoRefresh: true });

    return (
        <StatsGrid className="border border-content3 drop-shadow-lg">
            <PermissionGate requires={[Permission.READ_PROJECTS, Permission.READ_CARDS]}>
                <CardChangesStat />
            </PermissionGate>
            <PermissionGate requires={Permission.READ_USERS}>
                <ActiveUsersStat />
            </PermissionGate>
            <PermissionGate requires={[Permission.READ_PROJECTS, Permission.READ_CARDS]}>
                <CardsInTestingStat />
            </PermissionGate>
            <PermissionGate requires={[Permission.READ_PROJECTS, Permission.READ_REVIEWS]}>
                <ReviewsStat />
            </PermissionGate>
        </StatsGrid>
    );
}

function CardChangesStat() {
    const dayRange = 7;
    const since = useMemo(() => daysFromNow(-dayRange).toISOString(), [dayRange]);

    const { data: projectsData, isLoading: isLoadingProjectsData } = useGetProjectsQuery({ filter: { active: true } });
    const { data: cardsData, isLoading: isLoadingCardsData } = useGetCardsQuery({ filter: projectsData?.items.map((project) => ({ project: project.number, latest: true, updated: { $gte: since }, note: { $exists: true } })) }, { skip: !projectsData });

    const isLoading = isLoadingProjectsData || isLoadingCardsData;

    const footer = useMemo(() => {
        const noteMap = cardsData?.items.reduce<Record<NoteType, number>>((map, card) => {
            if (card.note) map[card.note.type]++;
            return map;
        }, { updated: 0, reworked: 0, replaced: 0, wording: 0 }) ?? {};

        return (
            <div className="flex gap-0.5 flex-wrap">
                {Object.entries(noteMap).filter(([, count]) => Number(count) > 0).map(([type, count]) => (<div key={type} className={classNames("bg-content3/50 px-2 rounded-full font-sans opacity-50 border-1", changeTypeClasses[type as ChangeType])}>{String(count)} {type}</div>))}
            </div>
        );
    }, [cardsData?.items]);

    return (
        <StatCard
            label={`Card Changes · ${dayRange} days`}
            value={cardsData?.total}
            footer={footer}
            isLoading={isLoading}
        />
    );
}

function ActiveUsersStat() {
    const dayRange = 14;
    const since = useMemo(() => daysFromNow(-dayRange).toISOString(), [dayRange]);
    const { data, isLoading } = useGetUsersQuery({ filter: { lastLogin: { $gte: since } } });

    return (
        <StatCard
            label="Active Users"
            value={data?.total}
            footer={`in the last ${dayRange} days`}
            isLoading={isLoading}
        />
    );
}

function CardsInTestingStat() {
    const { data: projectsData, isLoading: isLoadingProjectsData } = useGetProjectsQuery({ filter: { active: true } });
    const { data: cardsData, isLoading: isLoadingCardsData } = useGetCardsQuery({ filter: projectsData?.items.map((project) => ({ project: project.number, latest: true, released: { $exists: false } })) }, { skip: !projectsData });

    const isLoading = isLoadingProjectsData || isLoadingCardsData;

    const acrossProjects = useMemo(() => new Set(cardsData?.items.map((card) => card.project)), [cardsData?.items]);

    return (
        <StatCard
            label="Cards in testing"
            value={cardsData?.total}
            footer={`across ${acrossProjects.size} project${acrossProjects.size !== 1 ? "s" : ""}`}
            isLoading={isLoading}
        />
    );
}


function ReviewsStat() {
    const { data: projectsData, isLoading: isLoadingProjectsData } = useGetProjectsQuery({ filter: { active: true } });
    const { data: reviewsData, isLoading: isLoadingReviewsData } = useGetReviewsQuery({ filter: projectsData?.items.map((project) => ({ project: project.number })) });

    const isLoading = isLoadingProjectsData || isLoadingReviewsData;

    const numPlaytesters = new Set(reviewsData?.items.map((review) => review.reviewer)).size;
    return (
        <StatCard
            label="Reviews"
            value={reviewsData?.total}
            footer={`across ${numPlaytesters} playtesters`}
            isLoading={isLoading}
        />
    );
}


function StatCard({ label, value, footer, isLoading = false }: StatCardProps) {
    if (isLoading) {
        return (
            <div className="bg-content2 px-5 py-5 border-b-2 space-y-2">
                <Skeleton className="h-4 w-32 rounded-sm"/>
                <Skeleton className="h-12 w-28 rounded-sm"/>
                <Skeleton className="h-4 w-42 rounded-sm" />
            </div>
        );
    }
    return (
        <div className="bg-content2 px-5 py-5">
            <div className="text-xs font-cinzel tracking-wide uppercase text-foreground/50">
                {label}
            </div>
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