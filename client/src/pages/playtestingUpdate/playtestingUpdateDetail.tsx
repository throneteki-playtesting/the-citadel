import { useMemo, useState } from "react";
import { useGetPlaytestingUpdateCardsQuery, useGetPlaytestingUpdateImplementedQuery, useGetPlaytestingUpdateQuery, useGetPreviousCardQuery, useGetProjectQuery, usePlaytestingUpdatePrintSheetMutation } from "../../api";
import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { addToast, Alert, Button, Card, Chip, Link, Skeleton } from "@heroui/react";
import { CardPreview } from "@agot/card-preview";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { renderPlaytestingCard } from "common/utils";
import { downloadBlob, noteTypeIcon } from "../../utils";
import { IPlaytestCard } from "common/models/cards";
import ThronesIcon from "../../components/thronesIcon";
import { changeTypeClasses, factionBorderClasses, watermarkClasses } from "../../constants";
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { faAngleLeft, faBug, faCheck, faInfoCircle, faPrint } from "@fortawesome/free-solid-svg-icons";
import dismoji from "../../emojis";
import WebsiteUpdateStatus from "../../components/status/websiteUpdateStatus";
import { TouchTooltip } from "../../components/touchTooltip";
import { usePageTitle, useTimezone } from "../../api/hooks";
import CardStack from "../../components/cardStack";
import LoadingCard from "../../components/loadingCard";

export default function PlaytestingUpdateDetail({ project: projectNumber, version }: PlaytestingUpdateDetailProps) {
    const { data: playtestingUpdate, isLoading: isPlaytestingUpdateLoading } = useGetPlaytestingUpdateQuery({ project: projectNumber, version });
    const { data: project, isLoading: isProjectLoading } = useGetProjectQuery({ number: projectNumber });
    usePageTitle(project ? `${project.code} #${version}` : undefined);

    const isLoading = isPlaytestingUpdateLoading || isProjectLoading;

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
            <div className="space-y-4">
                <PlaytestingUpdateHeader project={project} playtestingUpdate={playtestingUpdate}/>
                <PlaytestingUpdateChangeNotes playtestingUpdate={playtestingUpdate} />
                <ImplementedCards playtestingUpdate={playtestingUpdate}/>
            </div>
        </div>
    );
}
type PlaytestingUpdateDetailProps = {
    project: number,
    version: number
}

function PlaytestingUpdateHeader({ project, playtestingUpdate }: PlaytestingUpdateHeaderProps) {
    const [renderPrintSheet, { isLoading: isRenderingPrintSheet }] = usePlaytestingUpdatePrintSheetMutation();
    const { format } = useTimezone();
    const bugReportUrl = import.meta.env.VITE_BUG_REPORT_URL;

    const onExportPNG = async () => {
        try {
            const blob = await renderPrintSheet(playtestingUpdate).unwrap();
            downloadBlob(blob, `${project.code}_v${playtestingUpdate.version}_changes.pdf`);
        } catch (err) {
            // TODO: Better error handling from redux (eg. use ApiError.message for description)
            addToast({ title: "Failed to download", color: "danger", description: "An unknown error has occurred" });
        }
    };
    return (
        <div className="relative space-y-1">
            <div className="flex">
                <div className="flex-1 flex items-center">
                    <div className="flex flex-col">
                        <Link href={`/project/${project.number}`} className="text-lg sm:text-2xl tracking-widest text-secondary font-cinzel leading-tight hover:brightness-150">
                            <FontAwesomeIcon icon={faAngleLeft}/> {project.name}
                        </Link>
                        <div className="text-2xl sm:text-4xl tracking-wider font-cinzel font-semibold text-primary">
                                Playesting Update #{playtestingUpdate.version}
                        </div>
                    </div>
                </div>
                <div className="flex flex-col">
                    <div className="w-fit shrink-0 grid grid-cols-3 gap-1 self-end">
                        <WebsiteUpdateStatus project={playtestingUpdate.project} version={playtestingUpdate.version} isIconOnly/>
                        <TouchTooltip content="Download Print PDF Sheet" placement="top">
                            <Button isIconOnly color="secondary" onPress={onExportPNG} isLoading={isRenderingPrintSheet}>
                                <FontAwesomeIcon icon={faPrint} />
                            </Button>
                        </TouchTooltip>
                        <TouchTooltip content="Report a bug">
                            <Button isIconOnly color="secondary" href={bugReportUrl}>
                                <FontAwesomeIcon icon={faBug} />
                            </Button>
                        </TouchTooltip>
                    </div>
                    <div className="justify-self-end self-end py-1 flex-1 mt-auto text-xxs sm:text-sm tracking-wider text-foreground font-sans">{format(new Date(playtestingUpdate.created))}</div>
                </div>
            </div>
            {playtestingUpdate.description && (
                <div className="text-md sm:text-lg font-sans leading-tight">
                    {playtestingUpdate.description}
                </div>
            )}
        </div>
    );
}
type PlaytestingUpdateHeaderProps = {
    project: IProject,
    playtestingUpdate: IPlaytestingUpdate
}

function PlaytestingUpdateChangeNotes({ playtestingUpdate }: PlaytestingUpdateChangeNotesProps) {
    const { data: cards, isLoading } = useGetPlaytestingUpdateCardsQuery({ project: playtestingUpdate.project, version: playtestingUpdate.version });

    if (isLoading) {
        // TODO: Improve
        return <Skeleton />;
    }

    if (!cards) {
        // TODO: Improve
        return <div>Error</div>;
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-4">
                <div className="h-px w-8 bg-primary/30" />
                <span className="font-cinzel text-xl uppercase tracking-widest text-primary">Card Changes</span>
                <div className="h-px flex-1 bg-primary/30" />
            </div>
            <div className="text-base text-foreground space-y-1">
                <p>Cards have changes to review, and will be applied together in this update.</p>
                <p className="text-sm"><FontAwesomeIcon icon={faInfoCircle}/> Click card to toggle between previous & new version.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cards.map((card) => <PlaytestingUpdateChangeNote key={card.code} card={card}/>)}
            </div>
        </div>
    );
}
type PlaytestingUpdateChangeNotesProps = {
    playtestingUpdate: IPlaytestingUpdate;
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
                        <div className="text-xxs font-cinzel ml-4 mt-1 leading-none text-foreground/40">Card #{card.number}</div>
                        <div className="text-lg font-cinzel text-foreground font-semibold px-4 py-2 leading-tight">{card.name} <span className="text-foreground/50 font-semibold">{card.version}</span></div>
                        <div className="flex-1 space-y-1">
                            {card.note ? (
                                <>
                                    <div className={classNames("text-lg tracking-wider font-cinzel uppercase pl-4 pr-10 py-0.5 w-full", changeTypeClasses[card.note.type])}><FontAwesomeIcon icon={noteTypeIcon[card.note.type]}/> {card.note.type}</div>
                                    <div className="text-sm tracking-wide text-foreground font-sans px-4 py-2">{card.note.text}</div>
                                </>
                            ) : <Alert color="danger" className="text-sm" title="No change note found!">This should not be possible, and likely indicates something went wrong.</Alert>}
                        </div>
                        <a href={card.github?.issueUrl} target="_blank" className="opacity-75 hover:opacity-100 px-2 font-sans">
                            {card.github?.status === "closed"
                                ? <Chip color="success" variant="bordered"><FontAwesomeIcon icon={faGithub}/> Implemented</Chip>
                                : <Chip color="warning" variant="bordered"><FontAwesomeIcon icon={faGithub}/> Not Implemented</Chip>
                            }
                        </a>
                    </div>
                </div>
                <CardStack cards={[previousCard, card]} selectedIndex={showNew ? 1 : 0} className="h-72 md:h-52 lg:h-72 cursor-pointer" onClick={() => setShowNew((prev) => !prev)} tilt={-2} >
                    {(card) => card ? <CardPreview card={renderPlaytestingCard(card)} className="select-none" rounded /> : <LoadingCard />}
                </CardStack>
            </div>
        </Card>
    );
}
type PlaytestingUpdateChangeNoteProps = {
    card: IPlaytestCard
}

function ImplementedCards({ playtestingUpdate }: ImplementedCardsProps) {
    const { data } = useGetPlaytestingUpdateImplementedQuery({ project: playtestingUpdate.project, version: playtestingUpdate.version });

    const otherImplemented = useMemo(() => {
        const changes = Object.entries(playtestingUpdate.cardChanges);
        return data?.filter((card) => !changes.some(([number, version]) => card.number === Number(number) && card.version === version));
    }, [data, playtestingUpdate.cardChanges]);

    if (!otherImplemented || otherImplemented.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-4">
                <div className="h-px w-8 bg-primary/30" />
                <span className="font-cinzel text-xl uppercase tracking-widest text-primary">Other Cards Implemented</span>
                <div className="h-px flex-1 bg-primary/30" />
            </div>
            <div className="text-base text-foreground space-y-1">
                <p>Some other cards have been implemented, and will be pushed to the Online Platform alongside this update.</p>
                <p className="text-sm"><FontAwesomeIcon icon={faInfoCircle}/> Click to view their closed <FontAwesomeIcon icon={faGithub}/> issue.</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1">
                {otherImplemented.map((card) =>
                    <a key={`${card.project}|${card.number}|${card.version}`} href={card.github?.issueUrl} target="_blank" className={classNames("border-2 px-2 py-1 rounded-xl hover:brightness-150 select-none overflow-hidden", factionBorderClasses[card.faction])}>
                        <div className="relative size-full">
                            <div className="absolute right-0 flex items-center justify-center pointer-events-none select-none">
                                <ThronesIcon name={card.faction} className={classNames("mr-8 text-5xl", watermarkClasses[card.faction])}/>
                            </div>
                            <div className="flex items-center gap-2">
                                <FontAwesomeIcon icon={faCheck} className="m-2 text-success" size="lg"/>
                                <div className="text-base font-cinzel text-foreground">{card.name} <span className="text-foreground font-semibold">{card.version}</span></div>
                            </div>
                        </div>
                    </a>)}
            </div>
        </div>
    );
}
type ImplementedCardsProps = {
    playtestingUpdate: IPlaytestingUpdate;
}