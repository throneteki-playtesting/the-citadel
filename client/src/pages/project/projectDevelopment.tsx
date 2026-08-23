import { Chip, Skeleton } from "@heroui/react";
import { IProject } from "common/models/projects";
import PermissionGate from "../../components/permissionGate";
import Permission from "common/models/permissions";
import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useGetProjectStatsQuery } from "../../api";
import StatsGrid from "../../components/statsGrid";
import ProjectPlaytestingUpdates from "./playtestingUpdate/projectPlaytestingUpdates";
import ProjectPlaytestingFocus from "./projectPlaytestingFocus";
import ProjectContent from "./projectContent";
import { BaseElementProps } from "../../types";
import { highlightTarget, releaseStatusColors } from "../../constants";
import { useNextReleaseStatus } from "../../components/status/useNextReleaseStatus";
import { useTagManagerOverrides } from "../../hooks/useTagManagerOverrides";

export default function ProjectDevelopment({ className, style, project, isActive }: ProjectDevelopmentProps) {
    useTagManagerOverrides({ autoRefresh: true });

    return (
        <div className={className} style={style}>
            <StatsGrid className="border border-content3 drop-shadow-lg">
                <PermissionGate requires={Permission.READ_STATS_PROJECT}>
                    <CardChangesStat project={project} />
                </PermissionGate>
                <PermissionGate requires={Permission.READ_STATS_PROJECT}>
                    <ReviewsStat project={project} />
                </PermissionGate>
                <PermissionGate requires={Permission.READ_STATS_PROJECT}>
                    <ActiveDecksStat project={project} />
                </PermissionGate>
                <PermissionGate requires={Permission.READ_RELEASES}>
                    <PacksStat project={project} />
                </PermissionGate>
            </StatsGrid>
            <div className="flex flex-col md:flex-row gap-2 md:gap-4 mt-2">
                <PermissionGate requires={Permission.READ_PLAYTESTING_UPDATES}>
                    <ProjectPlaytestingUpdates project={project} className="md:flex-1 min-w-0" />
                </PermissionGate>
                <PermissionGate requires={[Permission.READ_REVIEWS, Permission.READ_CARDS]}>
                    <ProjectPlaytestingFocus project={project} className="md:flex-1 min-w-0" />
                </PermissionGate>
            </div>
            <div className="mt-2">
                <ProjectContent project={project} isActive={isActive} />
            </div>
        </div>
    );
}

type ProjectDevelopmentProps = Omit<BaseElementProps, "children"> & {
    project: IProject;
    isActive: boolean;
};

function CardChangesStat({ project }: ProjectStatProps) {
    const { data, isLoading } = useGetProjectStatsQuery({ project: project.number });

    return (
        <StatCard
            label="Total Changes"
            value={data?.cardChanges.total}
            footer={
                data &&
                `across ${data.cardChanges.factionCount} faction${data.cardChanges.factionCount !== 1 ? "s" : ""}`
            }
            isLoading={isLoading}
        />
    );
}

function ReviewsStat({ project }: ProjectStatProps) {
    const { data, isLoading } = useGetProjectStatsQuery({ project: project.number });

    return (
        <StatCard
            label="Total Reviews"
            value={data?.reviews.total}
            footer={data && `across ${data.reviews.reviewerCount} playtesters`}
            isLoading={isLoading}
        />
    );
}
function ActiveDecksStat({ project }: ProjectStatProps) {
    const { data, isLoading } = useGetProjectStatsQuery({ project: project.number });

    return (
        <StatCard
            label="Submitted Decks"
            value={data?.activeDecks.total}
            footer="for cards in this project"
            isLoading={isLoading}
        />
    );
}

function PacksStat({ project }: ProjectStatProps) {
    const { release, filled, isLoading } = useNextReleaseStatus(project);

    if (isLoading) {
        return <StatCard label="Next Release" isLoading />;
    }

    if (!release) {
        return <StatCard label="Next Release" value="None" />;
    }

    const displayStatus = release.releasedDate ? "released" : release.status;
    const label = release.releasedDate ? "Latest Release" : "Next Release";
    const footer = (
        <span className="flex items-center gap-1.5">
            <Chip size="sm" variant="flat" className="capitalize" color={releaseStatusColors[displayStatus]}>
                {displayStatus}
            </Chip>
            <span className="truncate">{release.name}</span>
        </span>
    );

    return (
        <StatCard
            label={label}
            value={`${filled}/${release.capacity}`}
            footer={footer}
            to={`/project/${project.number}?tab=releases`}
            state={{ highlight: highlightTarget.release(project.number, release.code) }}
        />
    );
}
type ProjectStatProps = {
    project: IProject;
};

function StatCard({ label, value, footer, isLoading = false, to, state }: StatCardProps) {
    if (isLoading) {
        return (
            <div className="bg-content2/50 px-5 py-5 border-b-2 space-y-2">
                <Skeleton className="h-4 w-32 rounded-sm" />
                <Skeleton className="h-12 w-28 rounded-sm" />
                <Skeleton className="h-4 w-42 rounded-sm" />
            </div>
        );
    }
    const content = (
        <>
            <div className="text-xs font-cinzel tracking-wide uppercase text-foreground/50">{label}</div>
            <div className="text-4xl font-sans text-foreground mt-2 leading-none">{value ?? "-"}</div>
            {footer && <div className="text-sm font-serif italic text-foreground/50 mt-2">{footer}</div>}
        </>
    );
    if (!to) {
        return <div className="bg-content2/50 px-5 py-5">{content}</div>;
    }
    return (
        <Link
            to={to}
            state={state}
            className="block bg-content2/50 px-5 py-5 cursor-pointer hover:bg-content2 transition-colors"
        >
            {content}
        </Link>
    );
}
type StatCardProps = {
    label: string;
    value?: ReactNode;
    footer?: ReactNode;
    isLoading?: boolean;
    to?: string;
    state?: unknown;
};
