import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { useGetCardsQuery, useGetPlaytestingUpdateCardsQuery, useGetPlaytestingUpdatesQuery } from "../../../api";
import { useEffect, useMemo, useRef, useState } from "react";
import { faCheckSquare, faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "react-router-dom";
import Timestamp from "../../../components/timestamp";
import classNames from "classnames";
import ThronesIcon from "../../../components/thronesIcon";
import ChangeTypeChip from "../../home/changeTypeChip";
import { addToast, Alert, Button, ButtonProps, Skeleton } from "@heroui/react";
import CreatePlaytestingUpdateModal from "./createPlaytestingUpdateModal";
import PermissionGate from "../../../components/permissionGate";
import Permission from "common/models/permissions";
import { watermarkClasses } from "../../../constants";

export default function ProjectPlaytestingUpdates({ project }: ProjectPlaytestingUpdatesProps) {
    const { data, isLoading } = useGetPlaytestingUpdatesQuery({ filter: { project: project.number }, orderBy: { version: "asc" } });

    if (isLoading) {
        // TODO: Improve this
        return <Skeleton className="w-full h-full rounded-sm" />;
    }

    return (
        <div className="h-full flex flex-col min-h-64 space-y-2">
            <div className="flex items-center">
                <div className="text-md tracking-wide text-foreground/50 uppercase">Playtesting Updates</div>
                <CreateButton size="sm" color="primary" className="border border-content3 ml-auto" project={project}>Create New</CreateButton>
            </div>
            {data?.items && <PlaytestingUpdateCarousel items={data.items}/>}
        </div>
    );
}
type ProjectPlaytestingUpdatesProps = {
    project: IProject;
}
function PlaytestingUpdateCarousel({ items }: PlaytestingUpdateCarouselProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const updateScrollButtons = () => {
        const el = containerRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 0);
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth);
    };

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        // Scroll to end on mount
        el.scrollLeft = el.scrollWidth;
        updateScrollButtons();
    }, [items]);

    const scroll = (direction: "left" | "right") => {
        containerRef.current?.scrollBy({ left: direction === "left" ? -containerRef.current.clientWidth : containerRef.current.clientWidth, behavior: "smooth" });
    };

    return (
        <div className="relative">
            <button
                onPointerDown={() => scroll("left")}
                className={classNames(
                    "cursor-pointer absolute left-0 top-0 h-full w-10 z-10 flex items-center justify-center bg-black/10 hover:bg-black/25 active:bg-black/40 transition-all duration-300",
                    canScrollLeft ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
            >
                <FontAwesomeIcon icon={faChevronLeft} className="text-black drop-shadow text-3xl" />
            </button>
            <div
                ref={containerRef}
                onScroll={updateScrollButtons}
                className="flex overflow-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
            >
                {items.map((playtestingUpdate) => (
                    <div key={playtestingUpdate.version} className="shrink-0 w-full snap-start">
                        <PlaytestingUpdateSummary playtestingUpdate={playtestingUpdate} />
                    </div>
                ))}
            </div>
            <button
                onPointerDown={() => scroll("right")}
                className={classNames(
                    "cursor-pointer absolute right-0 top-0 h-full w-10 z-10 flex items-center justify-center bg-black/10 hover:bg-black/25 active:bg-black/40 transition-all duration-300",
                    canScrollRight ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
            >
                <FontAwesomeIcon icon={faChevronRight} className="text-black drop-shadow text-3xl" />
            </button>
        </div>
    );
}

type PlaytestingUpdateCarouselProps = { items: IPlaytestingUpdate[] };
function PlaytestingUpdateSummary({ playtestingUpdate }: PlaytestingUpdateSummaryProps) {
    if (!playtestingUpdate) {
        return (
            <div className="p-4 space-y-1 bg-content1/50 border border-content3 hover:bg-content2/50 transition-colors flex-1">
                No Updates
            </div>
        );
    }
    const isImplemented = playtestingUpdate.github?.status === "closed" && !!playtestingUpdate.github?.mergedAt;
    return (
        <div className="w-full">
            <Link to={`/project/${playtestingUpdate.project}/update/${playtestingUpdate.version}`}>
                <div className="p-4 space-y-1 bg-content1/50 border border-content3 hover:bg-content2/50 transition-colors">
                    <div className="flex gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap opacity-50">
                                <span className="text-primary text-md font-semibold">Update #{playtestingUpdate.version}</span>
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
                        <Timestamp className="ml-auto shrink-0 text-xs italic text-foreground/40 leading-none" date={new Date(playtestingUpdate.updated)} />
                    </div>
                    <CardChangeList project={playtestingUpdate.project} version={playtestingUpdate.version} />
                </div>
            </Link>
        </div>
    );
}
type PlaytestingUpdateSummaryProps = {
    playtestingUpdate?: IPlaytestingUpdate;
}

function CardChangeList({ project, version }: CardChangeListProps) {
    const maxShowCards = 4;
    const { data: cards, isLoading } = useGetPlaytestingUpdateCardsQuery({ project, version });

    if (isLoading) {
        return (
            <Skeleton className="w-full h-32 rounded-sm" />
        );
    }

    if (!cards) {
        return (
            <Alert color="danger">
                <div className="hidden">{`Project: ${project}, Version: ${version}`}</div>
                <div className="text-sm">Failed to load cards for update. Please alert an administrator.</div>
            </Alert>
        );
    }

    const slice = cards.slice(0, maxShowCards);

    return (
        <div className="flex flex-col border border-content3 divide-y divide-content3">
            {slice.map((card, index) => {
                if (cards.length > slice.length && index === slice.length - 1) {
                    const remaining = cards.length - slice.length + 1;
                    return (
                        <div key="more" className='relative overflow-hidden transition-colors pl-4 p-2 text-sm text-foreground truncate italic'>
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
                            className="grid grid-cols-[3.5rem_1fr] items-center gap-2 p-2"
                        >
                            <ChangeTypeChip className="text-[0.5rem]" card={card} />
                            <div className="text-sm font-semibold text-foreground truncate">{card.name} <span className="opacity-50">{card.version}</span></div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
type CardChangeListProps = {
    project: number;
    version: number;
}

const CreateButton = ({ project, children, ...props }: CreateButtonProps) => {
    const { data: draftsData, isLoading: isDraftsLoading } = useGetCardsQuery({ filter: { project: project.number, draft: true } });
    const [isModalOpen, setIsModalOpen] = useState(false);

    const draftCards = useMemo(() => draftsData?.items ?? [], [draftsData?.items]);

    return (
        <>
            {!isDraftsLoading && draftCards.length > 0 && (
                <PermissionGate requires={Permission.CREATE_PLAYTESTING_UPDATES}>
                    <Button {...props} onPress={() => setIsModalOpen(true)}>{children}</Button>
                    <CreatePlaytestingUpdateModal isOpen={isModalOpen} project={project} onClose={() => setIsModalOpen(false)} onSave={(playtestingUpdate) => addToast({ title: "Successfully submitted", color: "success", description: `${project.code} Playtesting Update #${playtestingUpdate.version} has been submitted` })}/>
                </PermissionGate>
            )}

        </>
    );
};
type CreateButtonProps = Omit<ButtonProps, "onPress"> & { project: IProject }