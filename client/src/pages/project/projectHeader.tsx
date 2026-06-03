import { BaseElementProps } from "../../types";
import { Button, ButtonGroup, Chip, Link, Skeleton } from "@heroui/react";
import { IProject } from "common/models/projects";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faPencil, faX } from "@fortawesome/free-solid-svg-icons";
import PermissionGate from "../../components/permissionGate";
import Permission from "common/models/permissions";
import classNames from "classnames";
import ProjectHeaderDraftNotice from "./draft/projectHeaderDraftNotice";
import ProjectPlaytestingUpdates from "./playtestingUpdate/projectPlaytestingUpdates";
import { useMemo, ReactNode } from "react";
import { useGetCardsQuery, useGetReviewsQuery } from "../../api";

const ProjectHeader = ({ className, style, project, onEdit = () => true, onDelete = () => true }: ProjectHeaderProps) => {
    return (
        <div className={classNames("space-y-2 md:space-y-4", className)} style={style}>
            <ButtonGroup className="absolute top-0 right-0 p-2">
                <PermissionGate requires={Permission.EDIT_PROJECTS}>
                    <Button isIconOnly variant="flat" size="sm" onPress={onEdit}><FontAwesomeIcon icon={faPencil}/></Button>
                </PermissionGate>
                <PermissionGate requires={Permission.DELETE_PROJECTS}>
                    <Button isIconOnly variant="flat" size="sm" color="danger" onPress={onDelete}><FontAwesomeIcon icon={faX}/></Button>
                </PermissionGate>
                {project.draft}
            </ButtonGroup>
            <div className="flex flex-col gap-2">
                <div className="text-xxs tracking-widest font-crimson uppercase text-foreground/40">
                        #{project.number} · <span className="uppercase">{project.type} · {project.version} updates</span>{project.mandateUrl && (<> · <Link href={project.mandateUrl} className="cursor-pointer text-xxs">Mandate <FontAwesomeIcon icon={faArrowUpRightFromSquare}/></Link></>)}
                </div>
                <div className="font-semibold font-cinzel tracking-widest text-2xl lg:text-3xl">{project.name}</div>
            </div>
            {project.draft && <ProjectHeaderDraftNotice project={project} className="w-1/2"/>}
            {project.description && <div className="text-sm lg:text-medium py-1">{project.description}</div>}
            <div className="grid grid-cols-2 sm:grid-cols-4 max-sm:divide-y divide-x divide-content3">
                <PermissionGate requires={Permission.READ_CARDS}><CardChangesStat project={project} /></PermissionGate>
                <PermissionGate requires={Permission.READ_REVIEWS}><ReviewsStat project={project} /></PermissionGate>
                <PermissionGate requires={Permission.READ_REVIEWS}><ActiveDecksStat project={project} /></PermissionGate>
                <PermissionGate requires={Permission.READ_CARDS}><PacksStat project={project} /></PermissionGate>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <ProjectPlaytestingUpdates project={project} />
            </div>
        </div>
    );
};

type ProjectHeaderProps = Omit<BaseElementProps, "children"> & {
    project: IProject,
    onEdit?: () => void,
    onDelete?: () => void
};

function CardChangesStat({ project }: ProjectStatProps) {
    const { data, isLoading } = useGetCardsQuery({ filter: { project: project.number, latest: true, note: { $exists: true } } });

    const factions = useMemo(() => new Set(data?.items.map((card) => card.faction)), [data?.items]);

    return <StatCard label="Total Changes" value={data?.total} footer={`across ${factions.size} faction${factions.size !== 1 ? "s" : ""}`} isLoading={isLoading}/>;}

function ReviewsStat({ project }: ProjectStatProps) {
    const { data, isLoading } = useGetReviewsQuery({ filter: { project: project.number } });

    const numPlaytesters = new Set(data?.items.map((review) => review.reviewer)).size;
    return (
        <StatCard
            label="Total Reviews"
            value={data?.total}
            footer={`across ${numPlaytesters} playtesters`}
            isLoading={isLoading}
        />
    );
}
function ActiveDecksStat({ project }: ProjectStatProps) {
    const { data, isLoading } = useGetReviewsQuery({ filter: { project: project.number } });
    const decks = useMemo(() => new Set(data?.items.reduce<string[]>((decks, review) => [...decks, ...review.decks], [])), [data?.items]);

    return <StatCard label="Submitted Decks" value={decks.size} footer="through reviews" isLoading={isLoading}/>;
}

function PacksStat({ project }: ProjectStatProps) {
    // TODO: Improve this when we have WIP packs implemented
    const { data, isLoading } = useGetCardsQuery({ filter: { project: project.number, latest: true, release: { $exists: true } } });
    const packs = useMemo(() => [...new Set(data?.items.map((card) => card.release!.short))], [data?.items]);
    const packChips = packs.length > 0 ? (
        <div className="flex flex-wrap gap-1">
            {packs.map((pack) => <Chip key={pack} size="sm" variant="bordered">{pack}</Chip>)}
        </div>) : <span className="text-2xl font-crimson tracking-wider">None</span>;

    return <StatCard label="Released Packs" value={packChips} isLoading={isLoading} />;
}
type ProjectStatProps = {
    project: IProject;
}

function StatCard({ label, value, footer, isLoading = false }: StatCardProps) {
    if (isLoading) {
        return (
            <div className="bg-content2 px-5 py-5 border-b-2 space-y-2">
                <Skeleton className="h-4 w-32 rounded-sm"/>
                <Skeleton className="h-12 w-28 rounded-sm"/>
                <Skeleton className="h-4 w-42 rounded-sm" />
            </div>
        );
    }
    return (
        <div className="bg-content2 px-5 py-5">
            <div className="text-xs font-cinzel tracking-wide uppercase text-foreground/50">
                {label}
            </div>
            <div className="text-4xl font-sans text-foreground mt-2 leading-none">{value ?? "-"}</div>
            {footer && <div className="text-sm font-serif italic text-foreground/50 mt-2">{footer}</div>}
        </div>
    );
}
type StatCardProps = {
  label: string;
  value?: ReactNode;
  footer?: ReactNode;
  isLoading?: boolean;
};

export default ProjectHeader;