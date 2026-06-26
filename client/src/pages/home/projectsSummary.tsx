import { IProject } from "common/models/projects";
import { ReactNode, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Chip, Progress, Skeleton } from "@heroui/react";
import { useGetCardsQuery, useGetProjectsQuery, useGetReviewsQuery } from "../../api";
import Permission from "common/models/permissions";
import { hasPermission } from "common/utils";
import PermissionGate from "../../components/permissionGate";
import StatsGrid from "../../components/statsGrid";
import { dismoji } from "../../constants";

export const ProjectsSummary = () => {
    const { data, isLoading } = useGetProjectsQuery({ filter: { active: true }, orderBy: { number: "desc" } });

    if (isLoading) {
        return (
            <div className="bg-content1 border border-content3 drop-shadow-lg">
                <div className="bg-content1 border border-content3">
                    <div className="flex flex-col sm:flex-row px-6 py-5 border-b border-content3 bg-content2 space-y-2">
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-20 rounded-sm"/>
                            <Skeleton className="h-8 w-56 rounded-sm"/>
                            <Skeleton className="h-4 w-42 rounded-sm"/>
                        </div>
                        <div className="flex items-center sm:flex-col sm:items-end gap-3 pt-1 min-w-64">
                            <Skeleton className="h-8 w-18 rounded-sm"/>
                            <Skeleton className="h-8 w-64 rounded-sm"/>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 max-sm:divide-y divide-x divide-content3">
                    <div className="px-6 py-4 space-y-1">
                        <Skeleton className="h-4 w-32 rounded-sm"/>
                        <Skeleton className="h-12 w-16 rounded-sm"/>
                        <Skeleton className="h-4 w-28 rounded-sm" />
                    </div>
                    <div className="px-6 py-4 space-y-1">
                        <Skeleton className="h-4 w-32 rounded-sm"/>
                        <Skeleton className="h-12 w-16 rounded-sm"/>
                        <Skeleton className="h-4 w-28 rounded-sm" />
                    </div>
                    <div className="px-6 py-4 space-y-1">
                        <Skeleton className="h-4 w-32 rounded-sm"/>
                        <Skeleton className="h-12 w-16 rounded-sm"/>
                        <Skeleton className="h-4 w-28 rounded-sm" />
                    </div>
                    <div className="px-6 py-4 space-y-1">
                        <Skeleton className="h-4 w-32 rounded-sm"/>
                        <Skeleton className="h-12 w-16 rounded-sm"/>
                        <Skeleton className="h-4 w-28 rounded-sm" />
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2">
            {data?.items.map((project) => <ProjectCard key={project.number} project={project} />)}
        </div>
    );
};

function ProjectCard({ project }: ProjectCardProps) {
    const { data: releasedData, isLoading } = useGetCardsQuery({ filter: { project: project.number, latest: true, release: { $exists: true } } });

    const navigate = useNavigate();
    const progress = useMemo(() => {
        if (!project) {
            return 0;
        }
        // TODO: Improve this once we have better tracking metrics (eg. wording, art, etc.)
        const total = Object.values(project.cardCount).reduce((total, faction) => total + faction);
        const released = releasedData?.total ?? 0;

        return (released / total) * 100;
    }, [project, releasedData?.total]);

    const statusChip = useMemo(() => {
        if (!project.active) {
            return <Chip radius="sm" color="success" variant="bordered">Archived</Chip>;
        }
        if (project.draft) {
            return <Chip radius="sm" color="secondary" variant="bordered">Draft</Chip>;
        }
        if (progress === 100) {
            return <Chip radius="sm" color="success" variant="bordered">Completed</Chip>;
        }
        return <Chip radius="sm" color="success" variant="bordered">Active</Chip>;
    }, [progress, project.active, project.draft]);

    return (
        <div
            onClick={() => !isLoading && navigate(`/project/${project.number}`)}
            className="bg-content1 border border-content3 cursor-pointer hover:border-content4 transition-colors drop-shadow-lg"
        >
            {isLoading
                ? (
                    <div className="bg-content1 border border-content3">
                        <div className="flex flex-col sm:flex-row px-6 py-5 border-b border-content3 bg-content2 space-y-2">
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-20 rounded-sm"/>
                                <Skeleton className="h-8 w-56 rounded-sm"/>
                                <Skeleton className="h-4 w-42 rounded-sm"/>
                            </div>
                            <div className="flex items-center sm:flex-col sm:items-end gap-3 pt-1 min-w-64">
                                <Skeleton className="h-8 w-18 rounded-sm"/>
                                <Skeleton className="h-8 w-64 rounded-sm"/>
                            </div>
                        </div>
                    </div>
                )
                : (
                    <div className="relative overflow-hidden">
                        <div className="absolute left-0 flex items-center justify-center pointer-events-none select-none">
                            <span className="ml-16 text-9xl opacity-10">{project.emoji && dismoji[project.emoji]}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row px-6 py-5 border-b border-content3 bg-content2">
                            <div className="flex-1">
                                <div className="text-xxs font-crimson tracking-widest uppercase text-foreground/40">
                                    #{project.number} · <span className="uppercase">{project.type} · Version {project.version}</span>
                                </div>
                                <h2 className="text-xl sm:text-2xl tracking-widest font-cinzel text-foreground">{project.name}</h2>
                            </div>
                            <div className="flex font-sans items-center sm:flex-col sm:items-end gap-3 pt-1 min-w-64">
                                {statusChip}
                                <Progress color="primary" label="Progress" value={progress} maxValue={100} size="sm" formatOptions={{ style: "percent" }} showValueLabel />
                            </div>
                        </div>
                    </div>
                )
            }
            <StatsGrid>
                <PermissionGate requires={Permission.READ_CARDS}><CardChangesStat project={project} /></PermissionGate>
                <PermissionGate requires={Permission.READ_REVIEWS}><ReviewsStat project={project} /></PermissionGate>
                <PermissionGate requires={Permission.READ_REVIEWS}><ActiveDecksStat project={project} /></PermissionGate>
                <PermissionGate requires={(user) => hasPermission(user, Permission.READ_CARDS) || hasPermission(user, Permission.READ_LATEST_CARDS)}>
                    <PacksStat project={project} />
                </PermissionGate>
            </StatsGrid>
        </div>
    );
}
type ProjectCardProps = {
    project: IProject;
};

function CardChangesStat({ project }: ProjectStatProps) {
    const { data, isLoading } = useGetCardsQuery({ filter: { project: project.number, version: { $ne: "1.0.0" } } });

    const factions = useMemo(() => new Set(data?.items.map((card) => card.faction)), [data?.items]);

    return <StatCard label={"Total Changes"} value={data?.total} footer={`across ${factions.size} faction${factions.size !== 1 ? "s" : ""}`} isLoading={isLoading}/>;
}

function ReviewsStat({ project }: ProjectStatProps) {
    const { data, isLoading } = useGetReviewsQuery({ filter: { project: project.number } });
    const reviewers = useMemo(() => new Set(data?.items.map((review) => review.reviewer)), [data?.items]);

    return <StatCard label="Playtesting Reviews" value={data?.total} footer={`from ${reviewers.size} playtesters`} isLoading={isLoading} />;
}

function ActiveDecksStat({ project }: ProjectStatProps) {
    const { data, isLoading } = useGetReviewsQuery({ filter: { project: project.number } });
    const decks = useMemo(() => new Set(data?.items.reduce<string[]>((decks, review) => [...decks, ...review.decks], [])), [data?.items]);

    return <StatCard label="Submitted Decks" value={decks.size} footer="through reviews" isLoading={isLoading}/>;
}

function PacksStat({ project }: ProjectStatProps) {
    // TODO: Improve this when we have WIP packs implemented
    const { data, isLoading } = useGetCardsQuery({ filter: { project: project.number, latest: true, release: { $exists: true } } });
    const packs = useMemo(() => [...new Set(data?.items.map((card) => card.release!.short))], [data?.items]);
    const packChips = packs.length > 0 ? (
        <div className="flex flex-wrap gap-1">
            {packs.map((pack) => <Chip key={pack} size="sm" variant="bordered">{pack}</Chip>)}
        </div>) : <span className="text-lg font-crimson tracking-wider">None</span>;

    return <StatCard label="Released Packs" value={packChips} isLoading={isLoading} />;
}
type ProjectStatProps = {
    project: IProject;
}

function StatCard({ label, value, footer, isLoading = false }: StatCardProps) {
    if (isLoading) {
        return (
            <div className="px-6 py-4 space-y-1">
                <Skeleton className="h-4 w-32 rounded-sm"/>
                <Skeleton className="h-12 w-16 rounded-sm"/>
                <Skeleton className="h-4 w-28 rounded-sm" />
            </div>
        );
    }
    return (
        <div className="px-6 py-4">
            <div className="text-xxs font-cinzel tracking-wide uppercase text-foreground/40">
                {label}
            </div>
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
}