import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { useGetCardsQuery, useGetPlaytestingUpdateCardsQuery, useGetPlaytestingUpdatesQuery } from "../../../api";
import { useMemo, useState } from "react";
import { faCheckSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate } from "react-router-dom";
import Timestamp from "../../../components/timestamp";
import classNames from "classnames";
import { Faction } from "common/models/cards";
import ThronesIcon from "../../../components/thronesIcon";
import ChangeTypeChip from "../../home/changeTypeChip";
import { addToast, Alert, Button, ButtonGroup, ButtonProps, Skeleton } from "@heroui/react";
import CreatePlaytestingUpdateModal from "./createPlaytestingUpdateModal";
import PermissionGate from "../../../components/permissionGate";
import Permission from "common/models/permissions";

export default function ProjectPlaytestingUpdates({ project }: ProjectPlaytestingUpdatesProps) {
    const { data, isLoading } = useGetPlaytestingUpdatesQuery({ filter: { project: project.number }, page: 1, perPage: 1, orderBy: { version: "desc" } });
    const navigate = useNavigate();
    const latest = useMemo(() => data?.items[0], [data?.items]);

    const content = useMemo(() => {
        if (!latest) {
            return <div className="w-full h-full">None</div>;
        }
        return <PlaytestingUpdateSummary playtestingUpdate={latest}/>;
    }, [latest]);

    if (isLoading) {
        return <Skeleton className="w-full h-full rounded-sm" />;
    }

    return (
        <div className="">
            <div className="text-md tracking-wide text-foreground/50 uppercase">Playtesting Updates</div>
            {content}
            <ButtonGroup radius="none" fullWidth variant="light">
                <CreateButton size="sm" color="primary" className="border border-content3" project={project}>Create New</CreateButton>
                <Button size="sm" color="secondary" className="border border-content3" onPress={() => navigate(`project/${project.number}/updates`)}>View All</Button>
            </ButtonGroup>
        </div>
    );
}
type ProjectPlaytestingUpdatesProps = {
    project: IProject;
}

function PlaytestingUpdateSummary({ playtestingUpdate }: PlaytestingUpdateSummaryProps) {
    const isImplemented = playtestingUpdate.github?.status === "closed" && !!playtestingUpdate.github?.mergedAt;
    return (
        <Link to={`/project/update/${playtestingUpdate.version}`}>
            <div className="p-4 space-y-1 bg-content1 border border-content3 hover:bg-content2 transition-colors">
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
                    <Timestamp className="ml-auto shrink-0 text-xs italic text-foreground/40 leading-none" date={new Date(playtestingUpdate.updated)} isEdited={new Date(playtestingUpdate.updated) > new Date(playtestingUpdate.created)} />
                </div>
                <CardChangeList project={playtestingUpdate.project} version={playtestingUpdate.version} />
            </div>
        </Link>
    );
}
type PlaytestingUpdateSummaryProps = {
    playtestingUpdate: IPlaytestingUpdate;
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
                            <ThronesIcon name={card.faction} className={classNames("ml-32 text-6xl", backgroundClasses[card.faction])}/>
                        </div>
                        <div
                            key={`${card.project}|${card.number}|${card.version}`}
                            className="grid grid-cols-[3.5rem_1fr] items-center gap-2 p-2"
                        >
                            {card.note && <ChangeTypeChip className="text-[0.5rem]" card={card} />}
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