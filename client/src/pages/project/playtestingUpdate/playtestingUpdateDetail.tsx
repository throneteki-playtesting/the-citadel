import { useMemo, useState } from "react";
import { useGetCardsQuery, useGetPlaytestingUpdateCardsQuery, useGetPlaytestingUpdateQuery, useGetPreviousCardQuery, useGetProjectQuery } from "../../../api";
import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { Alert, BreadcrumbItem, Breadcrumbs, Button, Card, Chip, Skeleton } from "@heroui/react";
import { CardPreview } from "@agot/card-preview";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { renderPlaytestingCard } from "common/utils";
import { noteTypeIcon } from "../../../utils";
import { IPlaytestCard } from "common/models/cards";
import ThronesIcon from "../../../components/thronesIcon";
import { changeTypeClasses, factionBorderClasses, watermarkClasses } from "../../../constants";
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { faCheck, faInfoCircle, faPenRuler, faPrint } from "@fortawesome/free-solid-svg-icons";
import dismoji from "../../../emojis";

export default function PlaytestingUpdateDetail({ project: projectNumber, version }: PlaytestingUpdateDetailProps) {
    const { data: playtestingUpdate, isLoading: isPlaytestingUpdateLoading } = useGetPlaytestingUpdateQuery({ project: projectNumber, version });
    const { data: project, isLoading: isProjectLoading } = useGetProjectQuery({ number: projectNumber });

    const isLoading = useMemo(() => isPlaytestingUpdateLoading || isProjectLoading, [isPlaytestingUpdateLoading, isProjectLoading]);

    if (isLoading) {
        // TODO: Improve once structure is confirmed
        return <div>
            <Skeleton className="w-full h-4 rounded-sm"/>
        </div>;
    }

    if (!project || !playtestingUpdate) {
        // TODO: Improve this page (maybe general 404 page)
        return <div>Update not found</div>;
    }

    return (
        <div className="relative">
            <div className="absolute right-0 top-0 flex items-center justify-center pointer-events-none select-none">
                <span className="-mt-24 mr-1/4 text-[16rem] opacity-20">{project.emoji && dismoji[project.emoji]}</span>
            </div>
            <Breadcrumbs size="lg">
                <BreadcrumbItem href={`/project/${projectNumber}`}>
                    {isProjectLoading ? <Skeleton className="w-24 h-6 rounded-lg"/> : project?.name}
                </BreadcrumbItem>
                <BreadcrumbItem isCurrent>Playesting Update #{version}</BreadcrumbItem>
            </Breadcrumbs>
            <div className="space-y-5 p-2">
                <PlaytestingUpdateHeader project={project} playtestingUpdate={playtestingUpdate}/>
                <PlaytestingUpdateChangeNotes project={projectNumber} version={version} />
            </div>
        </div>
    );
}
type PlaytestingUpdateDetailProps = {
    project: number,
    version: number
}

function PlaytestingUpdateHeader({ project, playtestingUpdate }: PlaytestingUpdateHeaderProps) {
    return (
        <div className="space-y-1">
            <div>
                <span className="text-2xl tracking-wider text-primary">{project.name}</span> <span className="text-xl tracking-wider text-foreground/40">· Playesting Update #{playtestingUpdate.version}</span>
            </div>
            {playtestingUpdate.description && (
                <div className="text-sm md:text-medium">
                    {playtestingUpdate.description}
                </div>
            )}
            <div className="py-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                <Alert icon={<FontAwesomeIcon icon={faGithub} />} color="warning" className="w-full" title="Online Platform" hideIconWrapper description={"Not Implemented Yet"}></Alert>
                <Button startContent={<FontAwesomeIcon icon={faPrint} />} className="size-full text-medium">{"Download Print Sheets"}</Button>
            </div>
        </div>
    );
}
type PlaytestingUpdateHeaderProps = {
    project: IProject,
    playtestingUpdate: IPlaytestingUpdate
}

function PlaytestingUpdateChangeNotes({ project, version }: PlaytestingUpdateChangeNotesProps) {
    const { data: cards, isLoading } = useGetPlaytestingUpdateCardsQuery({ project, version });
    const { data: newlyImplemented } = useGetCardsQuery({ filter: { project, github: { status: "closed" }, implemented: false } });

    const standaloneImplemented = useMemo(() => newlyImplemented?.items.filter((ni) => !cards?.some((card) => card.project === ni.project && card.number === ni.number && card.version === ni.version)) ?? [], [cards, newlyImplemented?.items]);

    if (isLoading) {
        // TODO: Improve
        return <Skeleton />;
    }

    if (!cards) {
        // TODO: Improve
        return <div>Error</div>;
    }

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <div className="text-2xl text-primary"><FontAwesomeIcon icon={faPenRuler}/> Card Changes</div>
                <div className="text-medium text-foreground">
                    <p>Cards have changes to review, and will be applied together in this update.</p>
                    <p className="italic"><FontAwesomeIcon icon={faInfoCircle}/> Click card to toggle between previous & new version.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {cards.map((card) => <PlaytestingUpdateChangeNote key={card.code} card={card}/>)}
                </div>
            </div>
            {standaloneImplemented.length > 0 &&
                (
                    <div className="space-y-2">
                        <div className="text-2xl text-primary"><FontAwesomeIcon icon={faCheck}/> Other Cards Implemented</div>
                        <div className="text-medium text-foreground">
                            <p>Some other cards have been implemented, and will be pushed to the Online Platform alongside this update.</p>
                            <p className="italic"><FontAwesomeIcon icon={faInfoCircle}/> Click to view their closed <FontAwesomeIcon icon={faGithub}/> issue.</p>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1">
                            {standaloneImplemented.map((ni) =>
                                <a href={ni.github?.issueUrl} target="_blank" className={classNames("border-2 px-2 py-1 rounded-xl hover:brightness-150 select-none", factionBorderClasses[ni.faction])}>
                                    <div className="relative size-full">
                                        <div className="absolute right-0 flex items-center justify-center pointer-events-none select-none">
                                            <ThronesIcon name={ni.faction} className={classNames("mr-8 text-5xl", watermarkClasses[ni.faction])}/>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <FontAwesomeIcon icon={faCheck} className="m-2 text-success" size="lg"/>
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="text-medium tracking-wide text-foreground truncate">{ni.name}</span>
                                                <span className="tracking-wider text-foreground/40">v{ni.version}</span>
                                            </div>
                                        </div>
                                    </div>
                                </a>)}
                        </div>
                    </div>
                )
            }

        </div>
    );
}
type PlaytestingUpdateChangeNotesProps = {
    project: number,
    version: number
}

function PlaytestingUpdateChangeNote({ card }: PlaytestingUpdateChangeNoteProps) {
    const [showNew, setShowNew] = useState(true);
    const { data: previousCard } = useGetPreviousCardQuery({ project: card.project, number: card.number, version: card.version });

    return (
        <Card className={classNames("border-1", factionBorderClasses[card.faction])}>
            <div className="grow flex transition-all duration-300 overflow-hidden">
                <div className="relative size-full">
                    <div className="absolute bottom-0 left-0 flex items-center justify-center pointer-events-none select-none">
                        <ThronesIcon name={card.faction} className={classNames("ml-8 mb-12 text-9xl", watermarkClasses[card.faction])}/>
                    </div>
                    <div className="flex flex-col h-full pb-2">
                        <div className="text-xxs ml-4 mt-1 leading-none text-foreground/40">Card #{card.number}</div>
                        <div className="font-semibold text-lg px-4">
                            <span className="tracking-wide text-foreground">{card.name}</span> <span className="tracking-wider text-foreground/40">· v{card.version}</span>
                        </div>
                        <div className="flex-1 space-y-1">
                            {card.note ? (
                                <>
                                    <div className={classNames("text-lg tracking-wider uppercase pl-4 pr-10 py-0.5 w-full", changeTypeClasses[card.note.type])}><FontAwesomeIcon icon={noteTypeIcon[card.note.type]}/> {card.note.type}</div>
                                    <div className="text-sm tracking-wide text-foreground px-4 py-1">{card.note.text}</div>
                                </>
                            ) : <Alert color="danger" className="text-sm" title="No change note found!">This should not be possible, and likely indicates something went wrong.</Alert>}
                        </div>
                        <a href={card.github?.issueUrl} target="_blank" className="opacity-75 hover:opacity-100 px-2">
                            {card.github?.status === "closed"
                                ? <Chip color="success" variant="bordered"><FontAwesomeIcon icon={faGithub}/> Implemented</Chip>
                                : <Chip color="warning" variant="bordered"><FontAwesomeIcon icon={faGithub}/> Not Implemented</Chip>
                            }
                        </a>
                    </div>
                </div>
                <div className="relative select-none cursor-pointer" onClick={() => setShowNew((prev) => !prev)}>
                    <div className={classNames("h-72 md:h-52 lg:h-72 transition-all duration-400 ease-in-out", { "brightness-50 -translate-x-2 -rotate-2 overflow-hidden": showNew })}>
                        {previousCard && <CardPreview card={renderPlaytestingCard(previousCard, { bottom: "Previous" })} />}
                    </div>
                    <div className={classNames("h-72 md:h-52 lg:h-72 absolute inset-0 transition-all duration-400 ease-in-out", !showNew ? "translate-x-[150%] rotate-10" : "translate-x-0")}>
                        <CardPreview card={renderPlaytestingCard(card, { bottom: "New" })} />
                    </div>
                </div>
            </div>
        </Card>
    );
}
type PlaytestingUpdateChangeNoteProps = {
    card: IPlaytestCard
}
