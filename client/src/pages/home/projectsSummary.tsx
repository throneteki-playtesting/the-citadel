import { IProject } from "common/models/projects";
import { ReactNode, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Chip, Skeleton } from "@heroui/react";
import classNames from "classnames";
import { useGetProjectProgressQuery, useGetProjectsQuery, useGetProjectStatsQuery } from "../../api";
import Permission from "common/models/permissions";
import PermissionGate from "../../components/permissionGate";
import ProjectProgressMeter from "../../components/projectProgressMeter";
import { usePermission } from "../../hooks/usePermission";
import StatsGrid from "../../components/statsGrid";
import { dismoji, highlightTarget, releaseStatusColors } from "../../constants";
import Watermark from "../../components/watermark";

export const ProjectsSummary = () => {
    const { data, isLoading } = useGetProjectsQuery({ filter: { active: true }, orderBy: { number: "desc" } });

    if (isLoading) {
        return (
            <div className="bg-content1 border border-content3 drop-shadow-lg">
                <div className="bg-content1 border border-content3">
                    <div className="flex flex-col sm:flex-row px-6 py-5 border-b border-content3 bg-content2 space-y-2">
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-20 rounded-sm" />
                            <Skeleton className="h-8 w-56 rounded-sm" />
                            <Skeleton className="h-4 w-42 rounded-sm" />
                        </div>
                        <div className="flex items-center sm:flex-col sm:items-end gap-3 pt-1 min-w-64">
                            <Skeleton className="h-8 w-18 rounded-sm" />
                            <Skeleton className="h-8 w-64 rounded-sm" />
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 max-sm:divide-y divide-x divide-content3">
                    <div className="px-6 py-4 space-y-1">
                        <Skeleton className="h-4 w-32 rounded-sm" />
                        <Skeleton className="h-12 w-16 rounded-sm" />
                        <Skeleton className="h-4 w-28 rounded-sm" />
                    </div>
                    <div className="px-6 py-4 space-y-1">
                        <Skeleton className="h-4 w-32 rounded-sm" />
                        <Skeleton className="h-12 w-16 rounded-sm" />
                        <Skeleton className="h-4 w-28 rounded-sm" />
                    </div>
                    <div className="px-6 py-4 space-y-1">
                        <Skeleton className="h-4 w-32 rounded-sm" />
                        <Skeleton className="h-12 w-16 rounded-sm" />
                        <Skeleton className="h-4 w-28 rounded-sm" />
                    </div>
                    <div className="px-6 py-4 space-y-1">
                        <Skeleton className="h-4 w-32 rounded-sm" />
                        <Skeleton className="h-12 w-16 rounded-sm" />
                        <Skeleton className="h-4 w-28 rounded-sm" />
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2">
            {data?.items.map((project) => (
                <ProjectCard key={project.number} project={project} />
            ))}
        </div>
    );
};

function ProjectCard({ project }: ProjectCardProps) {
    const navigate = useNavigate();
    const canReadStats = usePermission(Permission.READ_STATS_PROJECT);
    // The same figure the project page's meter shows, so the two always agree
    const { data: progressData } = useGetProjectProgressQuery({ project: project.number }, { skip: !canReadStats });
    const progress = progressData?.overall;

    const statusChip = useMemo(() => {
        if (!project.active) {
            return (
                <Chip radius="sm" color="success" variant="bordered">
                    Archived
                </Chip>
            );
        }
        if (project.draft) {
            return (
                <Chip radius="sm" color="secondary" variant="bordered">
                    Draft
                </Chip>
            );
        }
        if (progress === 100) {
            return (
                <Chip radius="sm" color="success" variant="bordered">
                    Completed
                </Chip>
            );
        }
        return (
            <Chip radius="sm" color="success" variant="bordered">
                Active
            </Chip>
        );
    }, [progress, project.active, project.draft]);

    return (
        <div
            onClick={() => navigate(`/project/${project.number}`)}
            className="bg-content1 border border-content3 cursor-pointer hover:border-content4 transition-colors drop-shadow-lg"
        >
            <Watermark
                position="left"
                icon={<span className="ml-16 text-9xl opacity-10">{project.emoji && dismoji[project.emoji]}</span>}
            >
                <div className="flex flex-col sm:flex-row px-6 py-5 border-b border-content3 bg-content2">
                    <div className="flex-1">
                        <div className="text-xxs font-crimson tracking-widest uppercase text-foreground/40">
                            #{project.number} ·{" "}
                            <span className="uppercase">
                                {project.type} · Version {project.version}
                            </span>
                        </div>
                        <h2 className="text-xl sm:text-2xl tracking-widest font-cinzel text-foreground">
                            {project.name}
                        </h2>
                    </div>
                    <div className="flex font-sans items-center sm:flex-col sm:items-end gap-3 pt-1 min-w-64">
                        {statusChip}
                        <ProjectProgressMeter project={project.number} size="sm" />
                    </div>
                </div>
            </Watermark>
            <StatsGrid>
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
                    <ReleasesStat project={project} />
                </PermissionGate>
            </StatsGrid>
        </div>
    );
}
type ProjectCardProps = {
    project: IProject;
};

function CardChangesStat({ project }: ProjectStatProps) {
    const { data, isLoading } = useGetProjectStatsQuery({ project: project.number });

    return (
        <StatCard
            label={"Total Changes"}
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
            label="Playtesting Reviews"
            value={data?.reviews.total}
            footer={data && `from ${data.reviews.reviewerCount} playtesters`}
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

function ReleasesStat({ project }: ProjectStatProps) {
    const navigate = useNavigate();
    const goToReleases = () => navigate(`/project/${project.number}?tab=releases`);

    if (project.type === "expansion") {
        const isReleased = project.releases[0]?.status === "released";
        return (
            <StatCard
                label="Released"
                value={isReleased ? "Yes" : "No"}
                onClick={project.releases.length > 0 ? goToReleases : undefined}
            />
        );
    }

    const packChips =
        project.releases.length > 0 ? (
            <div className="flex flex-wrap gap-1">
                {project.releases.map((release) => {
                    const displayStatus = release.releasedDate ? "released" : release.status;
                    return (
                        <Chip
                            key={release.code}
                            size="sm"
                            variant="flat"
                            color={releaseStatusColors[displayStatus]}
                            className="cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/project/${project.number}?tab=releases`, {
                                    state: { highlight: highlightTarget.release(project.number, release.code) }
                                });
                            }}
                        >
                            {release.code}
                        </Chip>
                    );
                })}
            </div>
        ) : (
            <span className="text-lg font-crimson tracking-wider">None</span>
        );

    return (
        <StatCard label="Releases" value={packChips} onClick={project.releases.length > 0 ? goToReleases : undefined} />
    );
}
type ProjectStatProps = {
    project: IProject;
};

function StatCard({ label, value, footer, isLoading = false, onClick }: StatCardProps) {
    if (isLoading) {
        return (
            <div className="px-6 py-4 space-y-1">
                <Skeleton className="h-4 w-32 rounded-sm" />
                <Skeleton className="h-12 w-16 rounded-sm" />
                <Skeleton className="h-4 w-28 rounded-sm" />
            </div>
        );
    }
    return (
        <div
            className={classNames("px-6 py-4", { "cursor-pointer hover:bg-content2 transition-colors": !!onClick })}
            onClick={
                onClick
                    ? (e) => {
                          e.stopPropagation();
                          onClick();
                      }
                    : undefined
            }
        >
            <div className="text-xxs font-cinzel tracking-wide uppercase text-foreground/40">{label}</div>
            <div className="text-3xl font-sans text-foreground leading-none">{value ?? "-"}</div>
            {footer && <div className="text-xs font-serif italic text-foreground/40 mt-1.5">{footer}</div>}
        </div>
    );
}
type StatCardProps = {
    label: string;
    value?: ReactNode;
    footer?: ReactNode;
    isLoading?: boolean;
    onClick?: () => void;
};
