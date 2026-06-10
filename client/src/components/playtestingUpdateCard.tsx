import { faCheckSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Skeleton, Alert } from "@heroui/react";
import classNames from "classnames";
import { IPlaytestCard } from "common/models/cards";
import { IPlaytestingUpdate } from "common/models/projects";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useGetProjectQuery, useGetPlaytestingUpdateCardsQuery } from "../api";
import { watermarkClasses } from "../constants";
import ChangeTypeChip from "../pages/home/changeTypeChip";
import ThronesIcon from "./thronesIcon";
import Timestamp from "./timestamp";
import { BaseElementProps } from "../types";

export default function PlaytestingUpdateCard({ className, style, playtestingUpdate, maxCards }: PlaytestingUpdateCardProps) {
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
        <Link to={`/project/${playtestingUpdate.project}/update/${playtestingUpdate.version}`}>
            <div className={classNames("p-4 space-y-1 hover:bg-content2 transition-colors", className)} style={style}>
                <div className="flex gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap opacity-75">
                            <div className="tracking-wider font-cinzel uppercase text-foreground">
                                <span className="text-foreground text-sm">{project.name} - <span className="font-semibold">#{playtestingUpdate.version}</span></span>
                            </div>
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
                    <Timestamp className="ml-auto shrink-0 text-xs italic text-foreground/40 leading-none font-sans" date={new Date(playtestingUpdate.updated)} />
                </div>
                <CardChangeList cards={cards} maxCards={maxCards} />
            </div>
        </Link>
    );
}
type PlaytestingUpdateCardProps = Omit<BaseElementProps, "children"> & {
    playtestingUpdate: IPlaytestingUpdate;
    maxCards?: number;
}

function CardChangeList({ cards, maxCards = 3 }: CardChangeListProps) {
    const slice = cards.slice(0, maxCards + 1);
    return (
        <div className="flex flex-col border border-content3 divide-y divide-content3">
            {slice.map((card, index) => {
                if (cards.length > slice.length && index === slice.length - 1) {
                    const remaining = cards.length - slice.length + 1;
                    return (
                        <div key="more" className='relative overflow-hidden transition-colors pl-5 p-1 text-sm font-crimson italic text-foreground truncate'>
                            {`+ ${remaining} more changes`}
                        </div>
                    );
                }
                return (
                    <div key={`${card.project}|${card.number}|${card.version}`} className='relative overflow-hidden transition-colors'>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                            <ThronesIcon name={card.faction} className={classNames("ml-32 text-6xl", watermarkClasses[card.faction])}/>
                        </div>
                        <div
                            key={`${card.project}|${card.number}|${card.version}`}
                            className="relative grid grid-cols-[3.5rem_1fr] items-center gap-2 p-2"
                        >
                            <ChangeTypeChip className="text-[0.5rem]" card={card} />
                            <div className="text-sm font-cinzel text-foreground truncate">{card.name} <span className="text-foreground/50 font-semibold">{card.version}</span></div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
type CardChangeListProps = {
    cards: IPlaytestCard[];
    maxCards?: number;
}