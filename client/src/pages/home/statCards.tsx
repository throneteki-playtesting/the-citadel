import classNames from "classnames";
import { useGetCardsQuery, useGetProjectsQuery, useGetReviewsQuery, useGetUsersQuery } from "../../api";
import { useMemo } from "react";
import { IPlaytestCard, NoteType } from "common/models/cards";
import { daysFromNow } from "../../utils";
import { Skeleton } from "@heroui/react";
import { IProject } from "common/models/projects";

export default function StatCards() {
    const { data: projectsData, isLoading: isLoadingProjectsData } = useGetProjectsQuery({ filter: { active: true } });
    const { data: cardsData, isLoading: isLoadingCardsData } = useGetCardsQuery({ filter: projectsData?.items.map((project) => ({ project: project.number, latest: true })) }, { skip: !projectsData });

    const isLoading = useMemo(() => isLoadingProjectsData || isLoadingCardsData, [isLoadingProjectsData, isLoadingCardsData]);

    return (
        <div className="grid grid-cols-2 md:grid-cols-4">
            <CardChangesStat latest={cardsData?.items ?? []} isLoading={isLoading}/>
            <ActivePlaytestersStat />
            <CardsInTestingStat projects={projectsData?.items ?? []} latest={cardsData?.items ?? []} isLoading={isLoading}/>
            <ReviewsStat projects={projectsData?.items ?? []} isLoading={isLoading} />
        </div>
    );
}

function CardChangesStat({ latest, isLoading = false }: CardChangesStatProps) {
    const dayRange = 7;
    const cards = latest.filter((card) => new Date(card.updated) >= daysFromNow(-dayRange));

    const footer = useMemo(() => {
        const noteMap = cards.reduce<Record<NoteType, number>>((map, card) => {
            if (card.note) map[card.note.type]++;
            return map;
        }, { updated: 0, reworked: 0, replaced: 0 });

        return Object.entries(noteMap).map(([type, count]) => `${count} ${type}`).join(" · ");
    }, [cards]);

    return (
        <StatCard
            label={`Card Changes · ${dayRange} days`}
            value={cards.length}
            footer={footer}
            isLoading={isLoading}
        />
    );
}
type CardChangesStatProps = {
    latest: IPlaytestCard[],
    isLoading?: boolean
}

function ActivePlaytestersStat() {
    const dayRange = 14;
    const date = useMemo(() => daysFromNow(-dayRange).toISOString(), []);
    const { data, isLoading } = useGetUsersQuery({ filter: { lastLogin: { $gte: date } } });

    return (
        <StatCard
            label="Active Playtesters"
            value={data?.total ?? 0}
            accent="secondary"
            footer={`in the last ${dayRange} days`}
            isLoading={isLoading}
        />
    );
}

function CardsInTestingStat({ projects, latest, isLoading = false }: CardsInTestingStatProps) {
    const cards = latest.filter((card) => !card.release);
    return (
        <StatCard
            label="Cards in testing"
            value={cards.length}
            accent="warning"
            footer={`accross ${projects.length} project${projects.length !== 1 ? "s" : ""}`}
            isLoading={isLoading}
        />
    );
}
type CardsInTestingStatProps = {
    projects: IProject[],
    latest: IPlaytestCard[],
    isLoading?: boolean
}


function ReviewsStat({ projects, isLoading = false }: ReviewsStatProps) {
    const { data, isLoading: isLoadingReviewsData } = useGetReviewsQuery({ filter: projects.map((project) => ({ project: project.number })) });
    const numPlaytesters = new Set(data?.items.map((review) => review.reviewer)).size;
    return (
        <StatCard
            label="Reviews"
            value={data?.total ?? 0}
            accent="danger"
            footer={`accross ${numPlaytesters} playtesters`}
            isLoading={isLoadingReviewsData || isLoading}
        />
    );
}
type ReviewsStatProps = {
    projects: IProject[],
    isLoading?: boolean
}


function StatCard({ label, value, footer, accent = "primary", isLoading = false }: StatCardProps) {
    if (isLoading) {
        return (
            <div className={classNames("bg-content2 px-5 py-5 border-t-2 space-y-2", accentBorder[accent])}>
                <Skeleton className="h-4 w-32 rounded-sm"/>
                <Skeleton className="h-12 w-28 rounded-sm"/>
                <Skeleton className="h-4 w-42 rounded-sm" />
            </div>
        );
    }
    return (
        <div className={classNames("bg-content2 px-5 py-5 border-t-2", accentBorder[accent])}>
            <p className="text-xxs tracking-wide uppercase text-foreground/50">
                {label}
            </p>
            <p className="text-5xl font-light text-foreground mt-2 leading-none">
                {value}
            </p>
            {footer && (
                <p className="text-sm italic text-foreground/50 mt-2">
                    {footer}
                </p>
            )}
        </div>
    );
}
type StatCardProps = {
  label: string;
  value: number | string;
  footer?: React.ReactNode;
  accent?: keyof typeof accentBorder;
  isLoading?: boolean;
};

const accentBorder = {
    primary: "border-primary",
    success: "border-success",
    danger: "border-danger",
    warning: "border-warning",
    secondary: "border-secondary"
} as const;