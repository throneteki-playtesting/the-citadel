import { Faction, IPlaytestCard } from "common/models/cards";
import { Link } from "react-router-dom";
import { useGetCardsQuery, useGetProjectsQuery } from "../../api";
import ThronesIcon from "../../components/thronesIcon";
import classNames from "classnames";
import { IProject } from "common/models/projects";
import Timestamp from "../../components/timestamp";
import NoteTypeChip from "./noteTypeChip";

export default function RecentCardChanges() {
    const { data: cardData, isLoading: isLoadingCards } = useGetCardsQuery({ filter: [{ note: { type: "updated" } }, { note: { type: "reworked" } }, { note: { type: "replaced" } }], orderBy: { updated: "desc" }, page: 1, perPage: 10 });
    const { data: projectData, isLoading: isLoadingProjects } = useGetProjectsQuery({ filter: cardData?.items.map((card) => ({ number: card.project })) }, { skip: !cardData });

    // TODO skeleton

    return (
        <div className="space-y-2">
            <div className="text-xs tracking-widest text-foreground/50 uppercase">Recent Card Changes</div>
            <div className="border border-content3 divide-y divide-content3">
                {cardData?.items.map((card) => (
                    <ChangeRow key={`${card.project}|${card.number}|${card.version}`} card={card} projects={projectData?.items} />
                ))}
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
                    <ThronesIcon name={card.faction} className={classNames("ml-32 text-7xl", backgroundClasses[card.faction])}/>
                </div>
                <div className="relative z-10">
                    <div className="grid grid-cols-[5rem_1fr] sm:grid-cols-[3.5rem_1fr] items-center gap-3 p-3 transition-colors">
                        <NoteTypeChip className="text-xs sm:text-[0.5rem]" noteType={card.note!.type} />
                        <div className="min-w-0">
                            <p className="text-[15px] font-semibold text-foreground truncate"><ThronesIcon name={card.type}/> {card.name}</p>
                            <p className="flex text-xs italic text-foreground/40 mt-0.5 truncate leading-none">
                                <span>{project?.code} #{card.number} · v{card.version}</span>
                                <Timestamp className="grow text-right" date={card.updated}/>
                            </p>
                        </div>
                    </div>
                </div>
            </Link>
        </div>
    );
}
type ChangeRowProps = { card: IPlaytestCard, projects?: IProject[] };

const backgroundClasses: Record<Faction, string> = {
    baratheon: "text-baratheon opacity-30",
    greyjoy: "text-greyjoy opacity-30",
    lannister: "text-lannister opacity-30",
    martell: "text-martell opacity-30",
    thenightswatch: "text-thenightswatch opacity-30",
    stark: "text-stark opacity-20",
    targaryen: "text-targaryen brightness-200",
    tyrell: "text-tyrell opacity-30",
    neutral: "text-neutral opacity-30"
};