import { Faction, IPlaytestCard } from "common/models/cards";
import Timestamp from "../../components/timestamp";
import { useGetPlaytestingUpdateCardsQuery, useGetPlaytestingUpdatesQuery, useGetProjectQuery } from "../../api";
import { useMemo } from "react";
import { IPlaytestingUpdate } from "common/models/projects";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheckSquare } from "@fortawesome/free-solid-svg-icons";
import ThronesIcon from "../../components/thronesIcon";
import classNames from "classnames";
import { Link } from "react-router-dom";
import ChangeTypeChip from "./changeTypeChip";
import { Alert, Skeleton } from "@heroui/react";

export default function RecentPlaytestingUpdates() {
    const items = 3;
    const { data, isLoading } = useGetPlaytestingUpdatesQuery({ orderBy: { updated: "desc" }, page: 1, perPage: items });

    const content = useMemo(() => {
        if (isLoading) {
            const array = Array.from({ length: items });
            return array.map((_, index) => (
                <div key={index} className="p-4 space-y-1 transition-colors">
                    <div className="flex gap-3">
                        <div className="min-w-0 space-y-1">
                            <Skeleton className="w-32 h-6 rounded-sm"/>
                            <Skeleton className="w-64 h-4 rounded-sm"/>
                        </div>
                    </div>
                    <Skeleton className="w-full h-32 rounded-sm"/>
                </div>
            ));
        }
        return data?.items.map((playtestingUpdate) => (
            <PlaytestingUpdateCard key={`${playtestingUpdate.project}|${playtestingUpdate.version}`} playtestingUpdate={playtestingUpdate} />
        ));
    }, [data?.items, isLoading]);

    return (
        <div className="space-y-2">
            <div className="text-xs tracking-widest text-foreground/50 uppercase">Recent Playtesting Updates</div>
            <div className="bg-content1 border border-content3 divide-y divide-content3">
                {content}
            </div>
        </div>
    );
}

function PlaytestingUpdateCard({ playtestingUpdate }: PlaytestingUpdateCardProps) {
    const { data: project, isLoading: isProjectLoading } = useGetProjectQuery({ number: playtestingUpdate.project });
    const { data: cards, isLoading: isCardsLoading } = useGetPlaytestingUpdateCardsQuery({ project: playtestingUpdate.project, version: playtestingUpdate.version });

    const isLoading = useMemo(() => isProjectLoading || isCardsLoading, [isCardsLoading, isProjectLoading]);

    if (isLoading) {
        return (
            <div className="p-4 space-y-1 transition-colors">
                <div className="flex gap-3">
                    <div className="min-w-0 space-y-1">
                        <Skeleton className="w-32 h-6 rounded-sm"/>
                        <Skeleton className="w-64 h-4 rounded-sm"/>
                    </div>
                </div>
                <Skeleton className="w-full h-32 rounded-sm"/>
            </div>
        );
    }

    if (!project || !cards) {
        return (
            <Alert color="danger">
                <div className="hidden">{`Project: ${playtestingUpdate.project}, Version: ${playtestingUpdate.version}`}</div>
                <div className="text-sm">Failed to load playtesting update. Please alert an administrator.</div>
            </Alert>
        );
    }

    const isImplemented = playtestingUpdate.github?.status === "closed" && !!playtestingUpdate.github?.mergedAt;

    return (
        <Link to={`/project/update/${playtestingUpdate.version}`}>
            <div className="p-4 space-y-1 hover:bg-content2 transition-colors">
                <div className="flex gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap opacity-50">
                            <p className="text-xs tracking-wider uppercase text-foreground flex items-center gap-1">
                                {project.name}
                            </p>
                            <span> · </span>
                            <span className="text-primary text-xs">v{playtestingUpdate.version}</span>
                            {isImplemented && (
                                <FontAwesomeIcon icon={faCheckSquare} className="text-success/80"/>
                            )}
                        </div>
                        {playtestingUpdate.description && (
                            <p className="text-xs italic text-foreground/40 leading-snug truncate">
                                {playtestingUpdate.description}
                            </p>
                        )}
                    </div>
                    <Timestamp className="ml-auto shrink-0 text-xs italic text-foreground/40 leading-none" date={new Date(playtestingUpdate.updated)} isEdited={new Date(playtestingUpdate.updated) > new Date(playtestingUpdate.created)} />
                </div>
                <CardChangeList cards={cards} />
            </div>
        </Link>
    );
}
type PlaytestingUpdateCardProps = {
    playtestingUpdate: IPlaytestingUpdate;
}

function CardChangeList({ cards }: CardChangeListProps) {
    return (
        <div className="flex flex-col border border-content3 divide-y divide-content3">
            {cards.map((card) => (
                <div key={`${card.project}|${card.number}|${card.version}`} className='relative overflow-hidden transition-colors'>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                        <ThronesIcon name={card.faction} className={classNames("ml-32 text-6xl", backgroundClasses[card.faction])}/>
                    </div>
                    <div
                        key={`${card.project}|${card.number}|${card.version}`}
                        className="grid grid-cols-[3.5rem_1fr] items-center gap-2 p-2 "
                    >
                        {card.note && <ChangeTypeChip className="text-[0.5rem]" card={card} />}
                        <div className="text-sm font-semibold text-foreground truncate">{card.name} <span className="opacity-50">{card.version}</span></div>
                    </div>
                </div>
            ))}
        </div>
    );
}
type CardChangeListProps = {
    cards: IPlaytestCard[]
}

const backgroundClasses: Record<Faction, string> = {
    baratheon: "text-baratheon opacity-20",
    greyjoy: "text-greyjoy opacity-20",
    lannister: "text-lannister opacity-20",
    martell: "text-martell opacity-20",
    thenightswatch: "text-thenightswatch opacity-20",
    stark: "text-stark opacity-20",
    targaryen: "text-targaryen brightness-100",
    tyrell: "text-tyrell opacity-20",
    neutral: "text-neutral opacity-20"
};