import { Chip, Skeleton } from "@heroui/react";
import { IProject } from "common/models/projects";
import PermissionGate from "../../components/permissionGate";
import Permission from "common/models/permissions";
import { ReactNode, useMemo } from "react";
import { useGetCardsQuery, useGetReviewsQuery } from "../../api";
import StatsGrid from "../../components/statsGrid";
import ProjectPlaytestingUpdates from "./playtestingUpdate/projectPlaytestingUpdates";
import ProjectPlaytestingFocus from "./projectPlaytestingFocus";
import ProjectContent from "./projectContent";
import { BaseElementProps } from "../../types";

export default function ProjectDevelopment({ className, style, project }: ProjectDevelopmentProps) {
    return (
        <div className={className} style={style}>
            <StatsGrid>
                <PermissionGate requires={Permission.READ_CARDS}><CardChangesStat project={project} /></PermissionGate>
                <PermissionGate requires={Permission.READ_REVIEWS}><ReviewsStat project={project} /></PermissionGate>
                <PermissionGate requires={Permission.READ_REVIEWS}><ActiveDecksStat project={project} /></PermissionGate>
                <PacksStat project={project} />
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
                <ProjectContent project={project} />
            </div>
        </div>
    );
};

type ProjectDevelopmentProps = Omit<BaseElementProps, "children"> & {
    project: IProject;
}

function CardChangesStat({ project }: ProjectStatProps) {
    const { data, isLoading } = useGetCardsQuery({ filter: { project: project.number, version: { $ne: "1.0.0" } } });

    const factions = useMemo(() => new Set(data?.items.map((card) => card.faction)), [data?.items]);

    return <StatCard label="Total Changes" value={data?.total} footer={`across ${factions.size} faction${factions.size !== 1 ? "s" : ""}`} isLoading={isLoading}/>;}

function ReviewsStat({ project }: ProjectStatProps) {
    const { data, isLoading } = useGetReviewsQuery({ filter: { project: project.number } });

    const numPlaytesters = new Set(data?.items.map((review) => review.reviewer)).size;
    return (
        <StatCard
            label="Total Reviews"
            value={data?.total}
            footer={`across ${numPlaytesters} playtesters`}
            isLoading={isLoading}
        />
    );
}
function ActiveDecksStat({ project }: ProjectStatProps) {
    const { data, isLoading } = useGetReviewsQuery({ filter: { project: project.number } });
    const decks = useMemo(() => new Set(data?.items.reduce<string[]>((decks, review) => [...decks, ...review.decks], [])), [data?.items]);

    return <StatCard label="Submitted Decks" value={decks.size} footer="through reviews" isLoading={isLoading}/>;
}

function PacksStat({ project }: ProjectStatProps) {
    const releasedPacks = useMemo(() => project.releases.filter((release) => release.releasedDate), [project.releases]);
    const packChips = releasedPacks.length > 0 ? (
        <div className="flex flex-wrap gap-1">
            {releasedPacks.map((release) => <Chip key={release.code} size="sm" variant="bordered">{release.code}</Chip>)}
        </div>) : <span className="text-2xl font-crimson tracking-wider">None</span>;

    return <StatCard label="Released Packs" value={packChips} />;
}
type ProjectStatProps = {
    project: IProject;
}

function StatCard({ label, value, footer, isLoading = false }: StatCardProps) {
    if (isLoading) {
        return (
            <div className="bg-content2/50 px-5 py-5 border-b-2 space-y-2">
                <Skeleton className="h-4 w-32 rounded-sm"/>
                <Skeleton className="h-12 w-28 rounded-sm"/>
                <Skeleton className="h-4 w-42 rounded-sm" />
            </div>
        );
    }
    return (
        <div className="bg-content2/50 px-5 py-5">
            <div className="text-xs font-cinzel tracking-wide uppercase text-foreground/50">
                {label}
            </div>
            <div className="text-4xl font-sans text-foreground mt-2 leading-none">{value ?? "-"}</div>
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
