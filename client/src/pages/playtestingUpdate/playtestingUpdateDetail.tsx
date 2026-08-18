import { useMemo, useState } from "react";
import {
    useGetPlaytestingUpdateCardsQuery,
    useGetPlaytestingUpdateImplementedQuery,
    useGetPlaytestingUpdateQuery,
    useGetPreviousCardQuery,
    useGetProjectQuery,
    usePlaytestingUpdatePrintSheetMutation
} from "../../api";
import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { Alert, Button, Card, Chip, Input, Skeleton } from "@heroui/react";
import { CardPreview } from "@agot/card-preview";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { renderPlaytestingCard } from "common/utils";
import { convertToNode, downloadBlob, noteTypeIcon } from "../../utils";
import { IPlaytestCard } from "common/models/cards";
import ThronesIcon from "../../components/thronesIcon";
import { changeTypeClasses, dismoji, factionBorderClasses, highlightTarget, watermarkClasses } from "../../constants";
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import {
    faAngleLeft,
    faBug,
    faCheck,
    faChevronLeft,
    faChevronRight,
    faInfoCircle,
    faMagnifyingGlass,
    faPrint,
    faXmarkCircle
} from "@fortawesome/free-solid-svg-icons";
import { useCodeUpdateStatus } from "../../components/status/useCodeUpdateStatus";
import { useDataUpdateStatus } from "../../components/status/useDataUpdateStatus";
import { useDiscordUpdateStatus } from "../../components/status/useDiscordUpdateStatus";
import HeaderActions from "../../components/actions/headerActions";
import { statusActionItem } from "../../components/actions/statusActionItem";
import { BaseStatus } from "../../components/status/baseStatus";
import { TouchTooltip } from "../../components/touchTooltip";
import CardStack from "../../components/cardStack";
import LoadingCard from "../../components/loadingCard";
import Error from "../../components/error";
import SectionTitle from "../../components/sectionTitle";
import usePageTitle from "../../hooks/usePageTitle";
import useConsumableParams from "../../hooks/useConsumableParams";
import { HighlightTarget } from "../../components/highlightTarget";
import useTimezone from "../../hooks/useTimezone";
import { Link } from "react-router-dom";
import PermissionedLink from "../../components/permissionedLink";
import Permission from "common/models/permissions";
import Watermark from "../../components/watermark";
import { showApiErrorToast } from "../../api/errors";

const UPDATE_PARAMS = ["card"] as const;

export default function PlaytestingUpdateDetail({ project: projectNumber, version }: PlaytestingUpdateDetailProps) {
    const { data: playtestingUpdate, isLoading: isPlaytestingUpdateLoading } = useGetPlaytestingUpdateQuery({
        project: projectNumber,
        version
    });
    const { data: project, isLoading: isProjectLoading } = useGetProjectQuery({ number: projectNumber });
    usePageTitle(project ? `${project.code} #${version}` : undefined);
    // Arriving from a card's change badge, which points at the one card it wants shown
    useConsumableParams(UPDATE_PARAMS, ({ card }) =>
        card ? { highlight: highlightTarget.playtestingUpdateCard(projectNumber, Number(card)) } : null
    );

    if (isPlaytestingUpdateLoading || isProjectLoading) {
        return (
            <div className="space-y-4">
                <div className="space-y-1">
                    <div className="flex">
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-6 w-32 rounded-md" />
                            <Skeleton className="h-10 w-64 rounded-md" />
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                            <div className="flex gap-1">
                                <Skeleton className="h-10 w-10 rounded-md" />
                                <Skeleton className="h-10 w-10 rounded-md" />
                                <Skeleton className="h-10 w-10 rounded-md" />
                            </div>
                            <Skeleton className="h-4 w-24 rounded-md" />
                        </div>
                    </div>
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-7 w-40 rounded-md" />
                    <div className="space-y-1">
                        <Skeleton className="h-5 w-96 rounded-md" />
                        <Skeleton className="h-4 w-72 rounded-md" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <PlaytestingUpdateChangeNoteSkeleton key={i} />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!project || !playtestingUpdate) {
        return (
            <Error
                label="No such raven has been sent from the Citadel..."
                content="This playtesting update could not be found. It may have been removed, or you may have followed an incorrect link."
            />
        );
    }

    return (
        <Watermark
            position="top-right"
            icon={
                <span className="-mt-12 mr-10 text-[10rem] md:-mt-24 md:mr-24 md:text-[16rem] opacity-20">
                    {project.emoji && dismoji[project.emoji]}
                </span>
            }
        >
            <div className="space-y-1 md:space-y-4">
                <PlaytestingUpdateHeader project={project} playtestingUpdate={playtestingUpdate} />
                <PlaytestingUpdateChangeNotes playtestingUpdate={playtestingUpdate} />
                <ImplementedCards playtestingUpdate={playtestingUpdate} />
                <div className="flex gap-2">
                    {playtestingUpdate.version > 1 && (
                        <Button
                            as={Link}
                            to={`/project/${projectNumber}/update/${version - 1}`}
                            variant="bordered"
                            startContent={<FontAwesomeIcon icon={faChevronLeft} />}
                        >
                            Previous Update
                        </Button>
                    )}
                    {playtestingUpdate.version < project.version && (
                        <Button
                            as={Link}
                            to={`/project/${projectNumber}/update/${version + 1}`}
                            variant="bordered"
                            endContent={<FontAwesomeIcon icon={faChevronRight} />}
                            className="ml-auto"
                        >
                            Next Update
                        </Button>
                    )}
                </div>
            </div>
        </Watermark>
    );
}
type PlaytestingUpdateDetailProps = {
    project: number;
    version: number;
};

const BUG_REPORT_URL = import.meta.env.VITE_BUG_REPORT_URL;

function PlaytestingUpdateHeader({ project, playtestingUpdate }: PlaytestingUpdateHeaderProps) {
    const [renderPrintSheet, { isLoading: isRenderingPrintSheet }] = usePlaytestingUpdatePrintSheetMutation();
    const { format } = useTimezone();
    const { data: codeStatus, isLoading: isCodeStatusLoading } = useCodeUpdateStatus(
        playtestingUpdate.project,
        playtestingUpdate.version
    );
    const { data: dataStatus, isLoading: isDataStatusLoading } = useDataUpdateStatus(
        playtestingUpdate.project,
        playtestingUpdate.version
    );
    const { data: discordStatus, isLoading: isDiscordStatusLoading } = useDiscordUpdateStatus(
        playtestingUpdate.project,
        playtestingUpdate.version
    );

    const onExportPNG = async () => {
        try {
            const blob = await renderPrintSheet(playtestingUpdate).unwrap();
            downloadBlob(blob, `${project.code}_v${playtestingUpdate.version}_changes.pdf`);
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Download" });
        }
    };
    const created = format(new Date(playtestingUpdate.created));

    return (
        <div className="relative space-y-1">
            <div className="px-4 md:px-0 flex flex-col sm:flex-row gap-2">
                <div className="flex-1 flex flex-wrap items-baseline gap-x-2">
                    <PermissionedLink
                        to={`/project/${project.number}`}
                        className="order-1 text-lg sm:text-2xl tracking-widest text-secondary font-cinzel leading-tight hover:brightness-150 w-fit"
                        requires={Permission.READ_PROJECTS}
                    >
                        <FontAwesomeIcon icon={faAngleLeft} /> {project.name}
                    </PermissionedLink>
                    <div className="order-2 sm:order-3 sm:basis-full text-xl sm:text-4xl tracking-wider font-cinzel font-semibold text-primary">
                        <span className="hidden sm:inline">Playtesting </span>Update #{playtestingUpdate.version}
                    </div>
                    <div className="order-3 basis-full sm:hidden text-xxs tracking-wider text-foreground font-sans">
                        {created}
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5">
                        <div className="hidden sm:flex items-center gap-1.5">
                            <BaseStatus isIconOnly data={codeStatus} isLoading={isCodeStatusLoading} />
                            <BaseStatus isIconOnly data={dataStatus} isLoading={isDataStatusLoading} />
                            <BaseStatus isIconOnly data={discordStatus} isLoading={isDiscordStatusLoading} />
                        </div>
                        <HeaderActions
                            items={[
                                statusActionItem("code-status", codeStatus, {
                                    isDropdownOnly: true,
                                    isLoading: isCodeStatusLoading
                                }),
                                statusActionItem("data-status", dataStatus, {
                                    isDropdownOnly: true,
                                    isLoading: isDataStatusLoading
                                }),
                                statusActionItem("discord-status", discordStatus, {
                                    isDropdownOnly: true,
                                    isLoading: isDiscordStatusLoading
                                }),
                                {
                                    key: "print",
                                    title: "Download Print PDF Sheet",
                                    icon: <FontAwesomeIcon icon={faPrint} />,
                                    onPress: onExportPNG,
                                    isLoading: isRenderingPrintSheet
                                },
                                !!BUG_REPORT_URL && {
                                    key: "report-bug",
                                    title: "Report a bug",
                                    icon: <FontAwesomeIcon icon={faBug} />,
                                    color: "secondary",
                                    href: BUG_REPORT_URL
                                }
                            ]}
                        />
                    </div>
                    <div className="hidden sm:block w-fit text-sm tracking-wider text-foreground font-sans">
                        {created}
                    </div>
                </div>
            </div>
            {playtestingUpdate.description && (
                <div className="px-4 md:px-0 text-md sm:text-lg font-sans leading-tight">
                    {playtestingUpdate.description}
                </div>
            )}
        </div>
    );
}
type PlaytestingUpdateHeaderProps = {
    project: IProject;
    playtestingUpdate: IPlaytestingUpdate;
};

function PlaytestingUpdateChangeNotes({ playtestingUpdate }: PlaytestingUpdateChangeNotesProps) {
    const { data: cards, isLoading } = useGetPlaytestingUpdateCardsQuery({
        project: playtestingUpdate.project,
        version: playtestingUpdate.version
    });
    const [search, setSearch] = useState("");

    const filteredCards = useMemo(() => {
        if (!cards || !search) {
            return cards;
        }

        const lowerSearch = search.toLowerCase();
        return cards.filter(
            (card) =>
                card.name.toLowerCase().includes(lowerSearch) ||
                card.text?.toLowerCase().includes(lowerSearch) ||
                card.faction.toLowerCase().includes(lowerSearch) ||
                card.type.toLowerCase().includes(lowerSearch) ||
                card.note?.type.toLowerCase().includes(lowerSearch) ||
                card.note?.text.toLowerCase().includes(lowerSearch)
        );
    }, [cards, search]);

    if (!isLoading && !cards) {
        return;
    }

    return (
        <div className="space-y-2">
            <SectionTitle size="xl" indent="md" className="px-4 md:px-0">
                Card Changes
            </SectionTitle>
            <div className="px-4 md:px-0 flex flex-col gap-2 md:flex-row md:justify-between">
                <div className="text-base text-foreground space-y-1">
                    <p>Cards have changes to review, and will be applied together in this update.</p>
                    <p className="text-sm">
                        <FontAwesomeIcon icon={faInfoCircle} /> Click card to toggle between previous & new version.
                    </p>
                </div>
                <Input
                    placeholder="Filter by name, faction, text, etc...."
                    value={search}
                    onValueChange={setSearch}
                    startContent={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                    endContent={
                        search ? (
                            <button onClick={() => setSearch("")}>
                                <FontAwesomeIcon icon={faXmarkCircle} className="text-default-400" />
                            </button>
                        ) : null
                    }
                    className="max-w-98 md:max-w-72"
                    isDisabled={!cards || isLoading}
                />
            </div>
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Array.from({ length: Object.keys(playtestingUpdate.cardChanges).length || 4 }).map((_, i) => (
                        <PlaytestingUpdateChangeNoteSkeleton key={i} />
                    ))}
                </div>
            ) : filteredCards && filteredCards.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredCards.map((card) => (
                        <HighlightTarget
                            key={card.code}
                            className="h-full rounded-large"
                            targetId={highlightTarget.playtestingUpdateCard(card.project, card.number)}
                        >
                            <PlaytestingUpdateChangeNote card={card} />
                        </HighlightTarget>
                    ))}
                </div>
            ) : (
                <Error
                    label="The raven arrived, but carried no news..."
                    content={
                        search
                            ? "No cards match your search."
                            : "This update contains no changed cards — an uncommon occurrence & usually indicates this is a legacy update."
                    }
                />
            )}
        </div>
    );
}
type PlaytestingUpdateChangeNotesProps = {
    playtestingUpdate: IPlaytestingUpdate;
};

function PlaytestingUpdateChangeNote({ card }: PlaytestingUpdateChangeNoteProps) {
    const [showNew, setShowNew] = useState(true);
    const { data: previousCard } = useGetPreviousCardQuery({
        project: card.project,
        number: card.number,
        version: card.version
    });

    const implementChip = useMemo(() => {
        if (card._metadata?.github?.status === "closed") {
            if (card.implemented) {
                return (
                    <TouchTooltip content={"Card is implemented & available on TiT"}>
                        <Chip color="success" variant="bordered">
                            <FontAwesomeIcon icon={faGithub} /> Implemented
                        </Chip>
                    </TouchTooltip>
                );
            } else {
                return (
                    <TouchTooltip content={"Card is implemented & will soon be available on TiT"}>
                        <Chip color="success" variant="bordered">
                            <FontAwesomeIcon icon={faGithub} /> Recently Implemented
                        </Chip>
                    </TouchTooltip>
                );
            }
        }

        return (
            <TouchTooltip content={"Card is not implemented on TiT"}>
                <Chip color="warning" variant="bordered">
                    <FontAwesomeIcon icon={faGithub} /> Not Implemented
                </Chip>
            </TouchTooltip>
        );
    }, [card._metadata?.github?.status, card.implemented]);

    return (
        // Stated rather than left to the default, since the highlight ring around it matches this radius
        <Card radius="lg" className={classNames("h-full border-1", factionBorderClasses[card.faction])}>
            <div className="grow flex flex-col max-sm:items-center sm:flex-row sm:items-start transition-all duration-300 overflow-hidden">
                <div className="relative size-full">
                    <Watermark
                        position="bottom-left"
                        icon={
                            <ThronesIcon
                                name={card.faction}
                                className={classNames("ml-8 mb-12 text-9xl", watermarkClasses[card.faction])}
                            />
                        }
                    />
                    <div className="relative flex flex-col h-full pb-2">
                        <div className="text-xxs font-cinzel ml-4 mt-1 leading-none text-foreground/40">
                            Card #{card.number}
                        </div>
                        <div className="text-lg font-cinzel text-foreground font-semibold px-4 py-2 leading-tight">
                            {card.name} <span className="text-foreground/50 font-semibold">{card.version}</span>
                        </div>
                        <div className="flex-1 space-y-1">
                            {card.note ? (
                                <>
                                    <div
                                        className={classNames(
                                            "text-lg tracking-wider font-cinzel uppercase pl-4 pr-10 py-0.5 w-full",
                                            changeTypeClasses[card.note.type]
                                        )}
                                    >
                                        <FontAwesomeIcon icon={noteTypeIcon[card.note.type]} /> {card.note.type}
                                    </div>
                                    <div className="text-sm tracking-wide text-foreground font-sans px-4 py-2">
                                        {convertToNode(card.note.text)}
                                    </div>
                                </>
                            ) : (
                                <Alert color="danger" className="text-sm" title="No change note found!">
                                    This should not be possible, and likely indicates something went wrong.
                                </Alert>
                            )}
                        </div>
                    </div>
                </div>
                <CardStack
                    cards={[previousCard, card]}
                    selectedIndex={showNew ? 1 : 0}
                    className={classNames(
                        "cursor-pointer shrink-0",
                        card.type === "plot" || previousCard?.type === "plot"
                            ? "w-72 sm:w-60 lg:w-72 aspect-[333/240]"
                            : "w-52 sm:w-44 lg:w-52 aspect-[240/333]"
                    )}
                    onClick={() => setShowNew((prev) => !prev)}
                    tilt={-2}
                >
                    {(card) =>
                        card ? (
                            <CardPreview card={renderPlaytestingCard(card)} className="select-none" rounded />
                        ) : (
                            <LoadingCard />
                        )
                    }
                </CardStack>
            </div>
            <div className="flex flex-wrap justify-between items-center gap-2 p-2 font-sans">
                <a href={card._metadata?.github?.issueUrl} target="_blank" className="opacity-75 hover:opacity-100">
                    {implementChip}
                </a>
                <PermissionedLink
                    to={`/project/${card.project}/${card.number}`}
                    requires={Permission.READ_CARDS}
                    className="opacity-75 hover:opacity-100"
                >
                    <Chip color="secondary" variant="bordered">
                        View Card Page
                    </Chip>
                </PermissionedLink>
            </div>
        </Card>
    );
}
type PlaytestingUpdateChangeNoteProps = {
    card: IPlaytestCard;
};

function PlaytestingUpdateChangeNoteSkeleton() {
    return (
        <Card className="border-1 border-content3">
            <div className="grow flex flex-col max-sm:items-center sm:flex-row sm:items-start overflow-hidden">
                <div className="relative size-full">
                    <div className="relative flex flex-col h-full pb-2 gap-2">
                        <Skeleton className="h-3 w-16 rounded-md ml-4 mt-1" />
                        <Skeleton className="h-6 w-40 rounded-md mx-4" />
                        <div className="flex-1 space-y-2 px-4">
                            <Skeleton className="h-6 w-full rounded-md" />
                            <Skeleton className="h-16 w-full rounded-md" />
                        </div>
                    </div>
                </div>
                <CardStack
                    cards={[undefined, undefined]}
                    className="shrink-0 w-52 sm:w-44 lg:w-52 aspect-[240/333]"
                    tilt={-2}
                >
                    {() => <LoadingCard />}
                </CardStack>
            </div>
            <div className="flex items-center gap-2 p-2">
                <Skeleton className="h-6 w-40 rounded-md" />
                <Skeleton className="h-6 w-28 rounded-md" />
            </div>
        </Card>
    );
}

function ImplementedCards({ playtestingUpdate }: ImplementedCardsProps) {
    const { data } = useGetPlaytestingUpdateImplementedQuery({
        project: playtestingUpdate.project,
        version: playtestingUpdate.version
    });

    const otherImplemented = useMemo(() => {
        const changes = Object.entries(playtestingUpdate.cardChanges);
        return data?.filter(
            (card) => !changes.some(([number, version]) => card.number === Number(number) && card.version === version)
        );
    }, [data, playtestingUpdate.cardChanges]);

    if (!otherImplemented || otherImplemented.length === 0) {
        return null;
    }

    const label =
        Object.keys(playtestingUpdate.cardChanges).length > 0 ? "Other Cards Implemented" : "Cards Implemented";

    return (
        <div className="space-y-2">
            <SectionTitle size="xl" indent="md">
                {label}
            </SectionTitle>
            <div className="text-base text-foreground space-y-1">
                <p>
                    Some other cards have been implemented, and will be pushed to the Online Platform alongside this
                    update.
                </p>
                <p className="text-sm">
                    <FontAwesomeIcon icon={faInfoCircle} /> Click to view their closed{" "}
                    <FontAwesomeIcon icon={faGithub} /> issue.
                </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1">
                {otherImplemented.map((card) => (
                    <a
                        key={`${card.project}|${card.number}|${card.version}`}
                        href={card._metadata?.github?.issueUrl}
                        target="_blank"
                        className={classNames(
                            "border-2 px-2 py-1 rounded-xl hover:brightness-150 select-none overflow-hidden",
                            factionBorderClasses[card.faction]
                        )}
                    >
                        <div className="relative size-full">
                            <Watermark
                                position="top-right"
                                icon={
                                    <ThronesIcon
                                        name={card.faction}
                                        className={classNames("mr-8 text-5xl", watermarkClasses[card.faction])}
                                    />
                                }
                            />
                            <div className="flex items-center gap-2">
                                <FontAwesomeIcon icon={faCheck} className="m-2 text-success" size="lg" />
                                <div className="text-base font-cinzel text-foreground">
                                    {card.name} <span className="text-foreground font-semibold">{card.version}</span>
                                </div>
                            </div>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
}
type ImplementedCardsProps = {
    playtestingUpdate: IPlaytestingUpdate;
};
