import { IProject } from "common/models/projects";
import { ReactNode, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import dismoji from "../../emojis";
import { Chip, Progress, Skeleton } from "@heroui/react";
import { useGetCardsQuery, useGetProjectsQuery, useGetReviewsQuery } from "../../api";
import { IPlaytestReview } from "common/models/reviews";
import { IPlaytestCard } from "common/models/cards";
import { daysFromNow } from "../../utils";

export const ProjectsSummary = () => {
    const { data, isLoading } = useGetProjectsQuery({ filter: [{ active: true }] });

    if (isLoading) {
        return <Skeleton className="w-full h-32 rounded-sm"/>;
    }
    return (
        <div className="flex flex-col gap-2">
            {data?.items.map((project) => <ProjectCard key={project.number} project={project} />)}
        </div>
    );
};

function ProjectCard({ project, isLoading: forcedIsLoading = false }: ProjectCardProps) {
    const { data: cardsData, isLoading: isLoadingCardsData } = useGetCardsQuery({ filter: { project: project.number, latest: true } });
    const { data: reviewsData, isLoading: isLoadingProjectsData } = useGetReviewsQuery({ filter: { project: project.number } });

    const isLoading = useMemo(() => forcedIsLoading || isLoadingCardsData || isLoadingProjectsData, [forcedIsLoading, isLoadingCardsData, isLoadingProjectsData]);

    const navigate = useNavigate();
    const progress = useMemo(() => {
        if (!project) {
            return 0;
        }
        // TODO: Improve this once we have better tracking metrics (eg. wording, art, etc.)
        const total = Object.values(project.cardCount).reduce((total, faction) => total + faction);
        const released = cardsData?.items.filter((card) => !!card.release).length ?? 0;

        return (released / total) * 100;
    }, [cardsData?.items, project]);

    const statusChip = useMemo(() => {
        if (!project.active) {
            return <Chip radius="sm" color="success" variant="bordered">Complete</Chip>;
        }
        if (project.draft) {
            return <Chip radius="sm" color="secondary" variant="bordered">Draft</Chip>;
        }
        return <Chip radius="sm" color="success" variant="bordered">Active</Chip>;
    }, [project.active, project.draft]);

    if (isLoading) {
        return (
            <div className="bg-content1 border border-content3 transition-colors">
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
        <div
            onClick={() => navigate(`/project/${project.number}`)}
            className="bg-content1 border border-content3 cursor-pointer hover:border-content4 transition-colors"
        >
            <div className="relative overflow-hidden">
                <div className="absolute left-0 flex items-center justify-center pointer-events-none select-none">
                    <span className="ml-16 text-9xl opacity-20">{project.emoji && dismoji[project.emoji]}</span>
                </div>
                <div className="flex flex-col sm:flex-row px-6 py-5 border-b border-content3 bg-content2">
                    <div className="flex-1">
                        <div className="text-xxs tracking-widest uppercase text-foreground/40">
                            #{project.number} · <span className="uppercase">{project.type} · version {project.version}</span>
                        </div>
                        <h2 className="text-xl sm:text-2xl font-semibold text-foreground">{project.name}</h2>
                        <div className="text-sm italic text-foreground/50 mt-1">{project.description}</div>
                    </div>
                    <div className="flex items-center sm:flex-col sm:items-end gap-3 pt-1 min-w-64">
                        {statusChip}
                        <Progress color="primary" label="Progress" value={progress} maxValue={100} size="sm" formatOptions={{ style: "percent" }} showValueLabel />
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 max-sm:divide-y divide-x divide-content3">
                <ReviewsStat reviews={reviewsData?.items} />
                <CardChangesStat latest={cardsData?.items} />
                <ActiveDecksStat reviews={reviewsData?.items} />
                <PacksStat latest={cardsData?.items} />
            </div>
        </div>
    );
}
type ProjectCardProps = {
  project: IProject;
  isLoading?: boolean;
};

function ReviewsStat({ reviews = [] }: ReviewsStatProps) {
    const amount = useMemo(() => reviews.length, [reviews.length]);
    const reviewers = useMemo(() => new Set(reviews.map((review) => review.reviewer)), [reviews]);

    return <ProjectStat label="Reviews this cycle" value={amount} footer={`from ${reviewers.size} playtesters`} />;
}
type ReviewsStatProps = {
    reviews?: IPlaytestReview[]
}

function CardChangesStat({ latest = [] }: CardChangesStatProps) {
    const dayRange = 7;
    const cards = useMemo(() => latest.filter((card) => new Date(card.updated) >= daysFromNow(-dayRange)), [latest]);
    const factions = useMemo(() => new Set(cards.map((card) => card.faction)), [cards]);

    return <ProjectStat label={`Changes · ${dayRange} days`} value={cards.length} footer={`accross ${factions.size} faction${factions.size !== 1 ? "s" : ""}`} />;
}
type CardChangesStatProps = {
    latest?: IPlaytestCard[]
}

function ActiveDecksStat({ reviews = [] }: ActiveDecksStatProps) {
    const decks = useMemo(() => new Set(reviews.reduce<string[]>((decks, review) => [...decks, ...review.decks], [])), [reviews]);

    return <ProjectStat label="Submitted Decks" value={decks.size} footer="from ThronesDB" />;
}
type ActiveDecksStatProps = {
    reviews?: IPlaytestReview[]
}

function PacksStat({ latest = [] }: PacksStatProps) {
    // TODO: Improve this when we have WIP packs implemented
    const packs = useMemo(() => [...new Set(latest.filter((card) => !!card.release).map((card) => card.release!.short))], [latest]);
    const packChips = packs.length > 0 ? (
        <div className="flex flex-wrap gap-1">
            {packs.map((pack) => <Chip key={pack} size="sm" variant="bordered">{pack}</Chip>)}
        </div>) : <span className="text-lg italic">None</span>;

    return <ProjectStat label="Released Packs" value={packChips} />;
}
type PacksStatProps = {
    latest?: IPlaytestCard[]
}

function ProjectStat({ label, value, footer }: ProjectStatProps) {
    return (
        <div className="px-6 py-4">
            <div className="text-xxs tracking-wide uppercase text-foreground/40 mb-2">
                {label}
            </div>
            <div className="text-3xl font-light text-foreground leading-none">{value}</div>
            {footer && <div className="text-xs italic text-foreground/40 mt-1.5">{footer}</div>}
        </div>
    );
}
type ProjectStatProps = {
    label: string;
    value: ReactNode;
    footer?: ReactNode;
}