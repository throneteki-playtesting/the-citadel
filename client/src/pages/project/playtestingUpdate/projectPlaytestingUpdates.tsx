import { IProject } from "common/models/projects";
import { useGetCardsQuery, useGetPlaytestingUpdatesQuery } from "../../../api";
import { useRef, useState } from "react";
import { addToast, Button, Skeleton } from "@heroui/react";
import CreatePlaytestingUpdateModal from "./createPlaytestingUpdateModal";
import PermissionGate from "../../../components/permissionGate";
import Permission from "common/models/permissions";
import PlaytestingUpdateMiniCard from "../../../components/playtestingUpdateMiniCard";
import { IPlaytestCard } from "common/models/cards";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRightFromBracket, faChevronLeft, faChevronRight, faFeather } from "@fortawesome/free-solid-svg-icons";
import SectionTitle from "../../../components/sectionTitle";

export default function ProjectPlaytestingUpdates({ className, project }: ProjectPlaytestingUpdatesProps) {
    return (
        <div className={classNames("space-y-2", className)}>
            <SectionTitle>Playtesting Updates</SectionTitle>
            <div className="bg-content1 border border-content3">
                <PlaytestingUpdateCarousel project={project} />
            </div>
        </div>
    );
}
type ProjectPlaytestingUpdatesProps = {
    className?: string;
    project: IProject;
};

function PlaytestingUpdateCarousel({ project }: PlaytestingUpdateCarouselProps) {
    const { data: playtestingData, isLoading } = useGetPlaytestingUpdatesQuery({
        filter: { project: project.number },
        orderBy: { version: "desc" }
    });
    const { data: cardsData } = useGetCardsQuery(
        { filter: { project: project.number, draft: true } },
        { skip: project.draft }
    );
    const containerRef = useRef<HTMLDivElement>(null);

    const scrollByPage = (direction: -1 | 1) => {
        const el = containerRef.current;
        if (!el) {
            return;
        }
        el.scrollBy({ left: direction * el.clientWidth, behavior: "smooth" });
    };

    if (isLoading) {
        return (
            <div className="p-4 space-y-1 transition-colors">
                <div className="flex gap-3">
                    <div className="min-w-0 space-y-1">
                        <Skeleton className="w-32 h-6 rounded-sm" />
                        <Skeleton className="w-64 h-4 rounded-sm" />
                    </div>
                </div>
                <Skeleton className="w-full h-32 rounded-sm" />
            </div>
        );
    }

    if (!playtestingData || playtestingData.total === 0) {
        return (
            <div className="min-h-32 p-4">
                <div className="text-2xl font-cinzel">The Archives are empty...</div>
                <div className="text-sm font-sans">
                    No updates exist yet for this project — this indicates it is fairly new, and that no card changes
                    have been pushed into playtesting.
                </div>
            </div>
        );
    }

    const showArrows = playtestingData.total + (cardsData?.total ? 1 : 0) > 1;

    return (
        <div className="relative">
            <div
                ref={containerRef}
                className="flex flex-row-reverse overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden divide-x divide-content2"
            >
                <CreateCard project={project} draftCards={cardsData?.items} />
                {playtestingData.items.map((playtestingUpdate) => (
                    <div key={playtestingUpdate.version} className="shrink-0 w-full snap-start">
                        <PlaytestingUpdateMiniCard
                            className="h-full"
                            playtestingUpdate={playtestingUpdate}
                            detailed
                            pinched
                        />
                    </div>
                ))}
            </div>
            {showArrows && (
                <>
                    <Button
                        isIconOnly
                        size="sm"
                        radius="full"
                        variant="light"
                        className="absolute left-1 top-1/2 -translate-y-1/2 z-10"
                        onPress={() => scrollByPage(-1)}
                    >
                        <FontAwesomeIcon icon={faChevronLeft} />
                    </Button>
                    <Button
                        isIconOnly
                        size="sm"
                        radius="full"
                        variant="light"
                        className="absolute right-1 top-1/2 -translate-y-1/2 z-10"
                        onPress={() => scrollByPage(1)}
                    >
                        <FontAwesomeIcon icon={faChevronRight} />
                    </Button>
                </>
            )}
        </div>
    );
}

type PlaytestingUpdateCarouselProps = { project: IProject };

function CreateCard({ project, draftCards = [] }: CreateCardProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    if (project.draft || draftCards.length === 0) {
        return null;
    }
    return (
        <PermissionGate requires={Permission.CREATE_PLAYTESTING_UPDATES}>
            <div
                className={classNames("min-w-full p-4 shrink-0 w-full snap-start space-y-1", {
                    "animate-pulse": !isModalOpen
                })}
            >
                <div className="text-xl md:text-2xl font-cinzel">
                    <FontAwesomeIcon icon={faFeather} /> Pending from the Archives
                </div>
                <div className="px-5">
                    <div className="text-xs md:text-sm font-sans">
                        {draftCards.length} draft card(s) are ready for the field. Draft cards must be published to
                        playtesting in bulk via a Playtesting Update — each update is tracked against a GitHub
                        implementation milestone, ensuring online play stays in step with the physical card pool.
                    </div>
                    <Button
                        className="font-sans text-sm md:text-base"
                        color="primary"
                        onPress={() => setIsModalOpen((prev) => !prev)}
                    >
                        Publish Updates <FontAwesomeIcon icon={faArrowRightFromBracket} />
                    </Button>
                </div>
            </div>
            <CreatePlaytestingUpdateModal
                isOpen={isModalOpen}
                project={project}
                onClose={() => setIsModalOpen(false)}
                onSave={(playtestingUpdate) =>
                    addToast({
                        title: "Successfully submitted",
                        color: "success",
                        description: `${project.code} Playtesting Update #${playtestingUpdate.version} has been submitted`
                    })
                }
            />
        </PermissionGate>
    );
}
type CreateCardProps = {
    project: IProject;
    draftCards?: IPlaytestCard[];
};
