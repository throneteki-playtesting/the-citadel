import { IPlaytestCard } from "common/models/cards";
import { Link } from "react-router-dom";
import { useGetCardsQuery, useGetProjectsQuery } from "../../api";
import ThronesIcon from "../../components/thronesIcon";
import classNames from "classnames";
import { IProject } from "common/models/projects";
import Timestamp from "../../components/timestamp";
import ChangeTypeChip from "./changeTypeChip";
import { useMemo } from "react";
import { Skeleton } from "@heroui/react";
import { watermarkClasses } from "../../constants";

export default function RecentCardChanges() {
    const items = 5;
    const { data: projectsData, isLoading: isProjectsDataLoading } = useGetProjectsQuery({ filter: { active: true } });
    const { data: cardsData, isLoading: isCardsDataLoading } = useGetCardsQuery({
        filter: projectsData?.items.map((project) => [{ project: project.number, latest: true }]).flat(),
        orderBy: { cardUpdated: "desc" },
        page: 1,
        perPage: items
    }, { skip: !projectsData });

    const isLoading = useMemo(() => isProjectsDataLoading || isCardsDataLoading, [isCardsDataLoading, isProjectsDataLoading]);

    const content = useMemo(() => {
        if (isLoading) {
            const array = Array.from({ length: items });
            return array.map((_, index) => (
                <div key={index} className="relative overflow-hidden bg-content1 hover:bg-content3">
                    <div className="relative z-10">
                        <div className="grid grid-cols-[5rem_1fr] sm:grid-cols-[3.5rem_1fr] items-center gap-3 p-3 transition-colors">
                            <Skeleton className="w-16 h-6 rounded-sm"/>
                            <div className="min-w-0 space-y-1">
                                <Skeleton className="w-32 h-4 rounded-sm"/>
                                <Skeleton className="w-20 h-4 rounded-sm"/>
                            </div>
                        </div>
                    </div>
                </div>
            ));
        }
        return cardsData?.items.map((card) => (
            <ChangeRow key={`${card.project}|${card.number}|${card.version}`} card={card} projects={projectsData?.items} />
        ));
    }, [cardsData?.items, isLoading, projectsData?.items]);

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-4">
                <div className="h-px w-4 bg-primary/30" />
                <span className="font-cinzel text-sm uppercase tracking-widest text-primary">Recent Card Changes</span>
                <div className="h-px flex-1 bg-primary/30" />
            </div>
            <div className="border border-content3 divide-y divide-content3">
                {content}
            </div>
        </div>
    );
}

function ChangeRow({ card, projects }: ChangeRowProps) {
    const project = projects?.find((project) => project.number === card.project);

    return (
        <div className="relative overflow-hidden bg-content1 hover:bg-content3">
            <Link to={`/project/${project?.number}/${card.number}`}>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                    <ThronesIcon name={card.faction} className={classNames("ml-32 text-7xl", watermarkClasses[card.faction])}/>
                </div>
                <div className="relative z-10">
                    <div className="grid grid-cols-[5rem_1fr] sm:grid-cols-[3.5rem_1fr] items-center gap-3 p-3 transition-colors">
                        <ChangeTypeChip className="text-xs sm:text-[0.5rem]" card={card} />
                        <div className="min-w-0">
                            <div className="text-sm font-cinzel text-foreground truncate"><ThronesIcon name={card.type}/> {card.name}</div>
                            <div className="flex text-xs font-crimson text-foreground/40 mt-0.5 truncate leading-none">
                                <span>{project?.code} #{card.number} · v{card.version}</span>
                                <Timestamp className="ml-auto text-right" date={card.updated}/>
                            </div>
                        </div>
                    </div>
                </div>
            </Link>
        </div>
    );
}
type ChangeRowProps = { card: IPlaytestCard, projects?: IProject[] };

