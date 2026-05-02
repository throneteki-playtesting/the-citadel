import { Faction } from "common/models/cards";
import Timestamp from "../../components/timestamp";
import { useGetPlaytestingUpdateCardsQuery, useGetPlaytestingUpdatesQuery, useGetProjectQuery } from "../../api";
import { useMemo } from "react";
import { IPlaytestingUpdate } from "common/models/projects";
import NoteTypeChip from "./noteTypeChip";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheckSquare } from "@fortawesome/free-solid-svg-icons";
import ThronesIcon from "../../components/thronesIcon";
import classNames from "classnames";
import { Link } from "react-router-dom";

export default function RecentPlaytestingUpdates() {
    const { data: playtestingUpdateData, isLoading: isLoadingPlaytestingUpdates } = useGetPlaytestingUpdatesQuery({ orderBy: { updated: "desc" }, page: 1, perPage: 3 });
    // TODO: Skeleton

    const playtestingUpdates = useMemo(() => playtestingUpdateData?.items, [playtestingUpdateData?.items]);
    return (
        <div className="space-y-2">
            <div className="text-xs tracking-widest text-foreground/50 uppercase">Recent Playtesting Updates</div>
            <div className="bg-content1 border border-content3 divide-y divide-content3">
                {playtestingUpdates?.map((playtestingUpdate) => (
                    <UpdateCard key={`${playtestingUpdate.project}|${playtestingUpdate.version}`} playtestingUpdate={playtestingUpdate} />
                ))}
            </div>
        </div>
    );
}

function UpdateCard({ playtestingUpdate }: { playtestingUpdate: IPlaytestingUpdate }) {
    const { data: project, isLoading: isLoadingProject } = useGetProjectQuery({ number: playtestingUpdate.project });

    if (!project) {
        return null;
    }

    // TODO: Skeleton

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
                <CardChangeList playtestingUpdate={playtestingUpdate} />
            </div>
        </Link>
    );
}

function CardChangeList({ playtestingUpdate }: { playtestingUpdate: IPlaytestingUpdate }) {
    const { data: cards, isLoading: isLoadingCards } = useGetPlaytestingUpdateCardsQuery({ project: playtestingUpdate.project, version: playtestingUpdate.version });

    if (!cards) {
        return null;
    }

    // TODO: Skeleton
    return (
        <div className="flex flex-col border border-content3 divide-y divide-content3">
            {cards.map((card) => (
                <Link to={`/project/${card.project}/${card.number}`}>
                    <div className='relative overflow-hidden hover:bg-content1 transition-colors'>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                            <ThronesIcon name={card.faction} className={classNames("ml-32 text-6xl", backgroundClasses[card.faction])}/>
                        </div>
                        <div
                            key={`${card.project}|${card.number}|${card.version}`}
                            className="grid grid-cols-[3.5rem_1fr] items-center gap-2 p-2 "
                        >
                            {card.note && <NoteTypeChip className="text-[0.5rem]" noteType={card.note.type} />}
                            <div className="text-sm font-semibold text-foreground truncate">{card.name} <span className="opacity-50">{card.version}</span></div>
                        </div>
                    </div>
                </Link>
            ))}
        </div>
    );
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