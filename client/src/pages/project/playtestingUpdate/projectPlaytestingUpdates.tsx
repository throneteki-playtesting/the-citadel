import { IProject } from "common/models/projects";
import { useGetCardsQuery, useGetPlaytestingUpdatesQuery } from "../../../api";
import { useEffect, useRef, useState } from "react";
import { addToast, Button, Skeleton } from "@heroui/react";
import CreatePlaytestingUpdateModal from "./createPlaytestingUpdateModal";
import PermissionGate from "../../../components/permissionGate";
import Permission from "common/models/permissions";
import PlaytestingUpdateCard from "../../../components/playtestingUpdateCard";
import { IPlaytestCard } from "common/models/cards";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRightFromBracket, faFeather } from "@fortawesome/free-solid-svg-icons";

export default function ProjectPlaytestingUpdates({ project }: ProjectPlaytestingUpdatesProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-4">
                <div className="h-px w-4 bg-primary/30" />
                <span className="font-cinzel text-sm uppercase tracking-widest text-primary">Playtesting Updates</span>
                <div className="h-px flex-1 bg-primary/30" />
            </div>
            <div className="bg-content1 border border-content3 divide-y divide-content3">
                <PlaytestingUpdateCarousel project={project} />
            </div>
        </div>
    );
}
type ProjectPlaytestingUpdatesProps = {
    project: IProject;
}
function PlaytestingUpdateCarousel({ project }: PlaytestingUpdateCarouselProps) {
    const { data: playtestingData, isLoading } = useGetPlaytestingUpdatesQuery({ filter: { project: project.number }, orderBy: { version: "asc" } });
    const { data: cardsData } = useGetCardsQuery({ filter: { project: project.number, draft: true } }, { skip: project.draft });
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        // Scroll to end on mount
        el.scrollLeft = el.scrollWidth;
    }, [playtestingData?.total, cardsData?.total]);

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

    if (!playtestingData || playtestingData.total === 0) {
        return (
            <div className="min-h-32 p-4">
                <div className="text-2xl font-cinzel">The Archives are empty...</div>
                <div className="text-sm font-sans">No updates exist yet for this project — this indicates it is fairly new, and that no card changes have been pushed into playtesting.</div>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="flex overflow-auto snap-x snap-mandatory divide-x divide-content2"
        >
            {playtestingData.items.map((playtestingUpdate) => (
                <div key={playtestingUpdate.version} className="shrink-0 w-full snap-start">
                    <PlaytestingUpdateCard className="h-full" playtestingUpdate={playtestingUpdate} />
                </div>
            ))}
            <CreateCard project={project} draftCards={cardsData?.items}/>
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
            <div className={classNames("min-w-full p-4 shrink-0 w-full snap-start space-y-1", { "animate-pulse": !isModalOpen })}>
                <div className="text-2xl font-cinzel"><FontAwesomeIcon icon={faFeather}/> Pending from the Archives</div>
                <div className="text-sm font-sans">{draftCards.length} draft card(s) are ready for the field. Draft cards must be published to playtesting in bulk via a Playtesting Update — each update is tracked against a GitHub implementation milestone, ensuring online play stays in step with the physical card pool.</div>
                <Button className="font-sans text-md" color="primary" onPress={() => setIsModalOpen((prev) => !prev)}>Publish Updates <FontAwesomeIcon icon={faArrowRightFromBracket}/></Button>
            </div>
            <CreatePlaytestingUpdateModal isOpen={isModalOpen} project={project} onClose={() => setIsModalOpen(false)} onSave={(playtestingUpdate) => addToast({ title: "Successfully submitted", color: "success", description: `${project.code} Playtesting Update #${playtestingUpdate.version} has been submitted` })}/>
        </PermissionGate>
    );
}
type CreateCardProps = {
    project: IProject;
    draftCards?: IPlaytestCard[];
}