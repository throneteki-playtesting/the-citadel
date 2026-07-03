import { IProject } from "common/models/projects";
import { Faction } from "common/models/cards";
import { IPlaytestReview } from "common/models/reviews";
import { factionNames } from "common/utils";
import { useMemo } from "react";
import { ScrollShadow, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCrow } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { useGetCardsQuery, useGetReviewsQuery } from "../../api";
import SectionTitle from "../../components/sectionTitle";
import ThronesIcon from "../../components/thronesIcon";
import { TouchTooltip } from "../../components/touchTooltip";
import PermissionedLink from "../../components/permissionedLink";
import Permission from "common/models/permissions";
import { factionBarClasses, highlightTarget, watermarkClasses } from "../../constants";
import { BaseElementProps } from "../../types";

export default function ProjectPlaytestingFocus({ className, style, project }: ProjectTestingFocusProps) {
    return (
        <div className={classNames("flex flex-col gap-2", className)} style={style}>
            <SectionTitle>
                Playtesting Focus
            </SectionTitle>
            <div className="md:relative md:flex-1 md:min-h-32">
                <ScrollShadow size={24} className="bg-content1 border border-content3 md:absolute md:inset-0">
                    <FactionFocusList project={project} />
                </ScrollShadow>
            </div>
        </div>
    );
}
type ProjectTestingFocusProps = Omit<BaseElementProps, "children"> & {
    project: IProject;
}

function FactionFocusList({ project }: FactionFocusListProps) {
    const { data: reviewsData, isLoading: isLoadingReviews } = useGetReviewsQuery({ filter: { project: project.number } });
    const { data: cardsData, isLoading: isLoadingCards } = useGetCardsQuery({ filter: { project: project.number, latest: true } });

    const factionStats = useMemo(() => {
        const reviewsByNumber = new Map<number, IPlaytestReview[]>();
        for (const review of reviewsData?.items ?? []) {
            const reviews = reviewsByNumber.get(review.number) ?? [];
            reviews.push(review);
            reviewsByNumber.set(review.number, reviews);
        }

        const stats = new Map<Faction, { cards: number, latest: number, older: number }>();
        for (const card of cardsData?.items ?? []) {
            const stat = stats.get(card.faction) ?? { cards: 0, latest: 0, older: 0 };
            stat.cards += 1;
            const reviews = reviewsByNumber.get(card.number) ?? [];
            if (reviews.some((review) => review.version === card.version)) {
                stat.latest += 1;
            } else if (reviews.length > 0) {
                stat.older += 1;
            }
            stats.set(card.faction, stat);
        }

        const sorted = [...stats.entries()]
            .map(([faction, stat]) => ({ faction, ...stat, untested: stat.cards - stat.latest - stat.older, percent: Math.round(((stat.latest + stat.older) / stat.cards) * 100) }))
            .sort((a, b) => a.percent - b.percent || factionNames[a.faction].localeCompare(factionNames[b.faction]));

        let rank = 1;
        return sorted.map((stat, index) => {
            if (index > 0 && stat.percent !== sorted[index - 1].percent) {
                rank = index + 1;
            }
            return { ...stat, rank };
        });
    }, [cardsData?.items, reviewsData?.items]);

    if (isLoadingReviews || isLoadingCards) {
        return (
            <div className="divide-y divide-content3">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-2 p-2">
                        <Skeleton className="w-32 h-5 rounded-sm"/>
                        <Skeleton className="ml-auto w-24 h-4 rounded-sm"/>
                    </div>
                ))}
            </div>
        );
    }

    if (factionStats.length === 0) {
        return (
            <div className="min-h-32 p-4">
                <div className="text-2xl font-cinzel"><FontAwesomeIcon icon={faCrow}/> The ravens are silent...</div>
                <div className="text-sm font-sans">This project has no cards in playtesting yet — once cards are published, the factions most in need of testing will be listed here.</div>
            </div>
        );
    }

    return (
        <div className="divide-y divide-content3">
            {factionStats.map(({ faction, cards, latest, older, untested, percent, rank }) => (
                <PermissionedLink
                    key={faction}
                    to={`/project/${project.number}`}
                    state={{ highlight: highlightTarget.factionCarousel(project.number, faction), sortBy: "priority" }}
                    requires={Permission.READ_CARDS}
                >
                    <div className="relative overflow-hidden hover:bg-content2 transition-colors">
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                            <ThronesIcon name={faction} className={classNames("ml-32 text-6xl", watermarkClasses[faction])}/>
                        </div>
                        <div className="relative flex items-center gap-2 p-2">
                            <div className="w-6 shrink-0 text-xs font-cinzel text-foreground/40">#{rank}</div>
                            <div className="flex-1 text-sm font-cinzel text-foreground truncate">{factionNames[faction]}</div>
                            <div className="shrink-0 text-sm font-sans text-foreground/60">{percent}% Tested</div>
                        </div>
                        <div className="absolute bottom-0 inset-x-0 h-1 flex">
                            <TouchTooltip
                                content={<div className="text-sm font-cinzel whitespace-nowrap px-1 py-0.5">{latest}/{cards} Latest Reviewed</div>}
                                size="sm"
                                delay={0}
                                closeDelay={0}
                            >
                                <div className={classNames(factionBarClasses[faction], "hover:brightness-150 hover:border-1 border-white transition-all cursor-default")} style={{ width: `${(latest / cards) * 100}%` }}/>
                            </TouchTooltip>
                            <TouchTooltip
                                content={<div className="text-sm font-cinzel whitespace-nowrap px-1 py-0.5">{older}/{cards} Older Version Reviewed</div>}
                                size="sm"
                                delay={0}
                                closeDelay={0}
                            >
                                <div className={classNames(factionBarClasses[faction], "opacity-40 hover:brightness-150 hover:border-1 border-white transition-all cursor-default")} style={{ width: `${(older / cards) * 100}%` }}/>
                            </TouchTooltip>
                            <TouchTooltip
                                content={<div className="text-sm font-cinzel whitespace-nowrap px-1 py-0.5">{untested}/{cards} Not Reviewed</div>}
                                size="sm"
                                delay={0}
                                closeDelay={0}
                            >
                                <div className="flex-1 bg-content3/50 hover:brightness-150 hover:border-1 border-white transition-all cursor-default"/>
                            </TouchTooltip>
                        </div>
                    </div>
                </PermissionedLink>
            ))}
        </div>
    );
}
type FactionFocusListProps = {
    project: IProject;
}
