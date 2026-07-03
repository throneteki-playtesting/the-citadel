import { BaseElementProps } from "../../types";
import { Button, Chip, Link, Skeleton } from "@heroui/react";
import { IProject } from "common/models/projects";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faBoxArchive, faPencil, faTrash } from "@fortawesome/free-solid-svg-icons";
import PermissionGate from "../../components/permissionGate";
import Permission from "common/models/permissions";
import { hasPermission } from "common/utils";
import classNames from "classnames";
import ProjectHeaderDraftNotice from "./draft/projectHeaderDraftNotice";
import ProjectPlaytestingUpdates from "./playtestingUpdate/projectPlaytestingUpdates";
import ProjectPlaytestingFocus from "./projectPlaytestingFocus";
import { useMemo, ReactNode } from "react";
import { useGetCardsQuery, useGetReviewsQuery } from "../../api";
import { TouchTooltip } from "../../components/touchTooltip";
import StatsGrid from "../../components/statsGrid";

const ProjectHeader = ({ className, style, project, onEdit = () => true, onDelete = () => true }: ProjectHeaderProps) => {
    const headerComponents = useMemo(() => {
        const components: ReactNode[] = [
            <span key="number">#{project.number}</span>,
            <span key="type" className="uppercase">{project.type}</span>
        ];

        if (project.draft) {
            components.push(<span key="version">In Draft</span>);
        } else {
            components.push(<span key="version">{project.version} updates</span>);
        }

        if (project.mandateUrl) {
            components.push(<Link key="mandate" href={project.mandateUrl} className="cursor-pointer">Mandate <FontAwesomeIcon icon={faArrowUpRightFromSquare}/></Link>);
        }

        return (
            <>
                {components.flatMap((node, i) =>
                    i === 0 ? [node] : [<span key={`sep-${i}`} className="mx-1">·</span>, node]
                )}
            </>
        );
    }, [project.draft, project.mandateUrl, project.number, project.type, project.version]);

    return (
        <div className={classNames("space-y-2 md:space-y-4", className)} style={style}>
            <div className="flex flex-col sm:flex-row">
                <div className="flex flex-1 flex-col gap-2">
                    <div className="text-xs tracking-widest font-cinzel uppercase text-foreground/40">
                        {headerComponents}
                    </div>
                    <div className="font-semibold font-cinzel tracking-widest text-2xl lg:text-3xl">{project.name}</div>
                </div>
                <div className="self-end sm:self-start flex gap-1">
                    <PermissionGate requires={Permission.EDIT_PROJECTS}>
                        <TouchTooltip content="Edit Project">
                            <Button isIconOnly onPress={onEdit}>
                                <FontAwesomeIcon icon={faPencil}/>
                            </Button>
                        </TouchTooltip>
                    </PermissionGate>
                    {project.draft && !project.active &&
                    <PermissionGate requires={Permission.DELETE_PROJECTS}>
                        <TouchTooltip content="Delete Project">
                            <Button isIconOnly color="danger" onPress={onDelete}>
                                <FontAwesomeIcon icon={faTrash}/>
                            </Button>
                        </TouchTooltip>
                    </PermissionGate>
                    }
                    {!project.draft && project.active &&
                    <PermissionGate requires={Permission.ARCHIVE_PROJECTS}>
                        <TouchTooltip content="Archive Project">
                            <Button isIconOnly color="danger" onPress={onDelete}>
                                <FontAwesomeIcon icon={faBoxArchive}/>
                            </Button>
                        </TouchTooltip>
                    </PermissionGate>
                    }
                </div>
            </div>
            {project.description && <div className="text-sm lg:text-medium py-1">{project.description}</div>}
            {project.draft && <ProjectHeaderDraftNotice project={project} />}
            {!project.draft && (
                <StatsGrid>
                    <PermissionGate requires={Permission.READ_CARDS}><CardChangesStat project={project} /></PermissionGate>
                    <PermissionGate requires={Permission.READ_REVIEWS}><ReviewsStat project={project} /></PermissionGate>
                    <PermissionGate requires={Permission.READ_REVIEWS}><ActiveDecksStat project={project} /></PermissionGate>
                    <PermissionGate requires={(user) => hasPermission(user, Permission.READ_CARDS) || hasPermission(user, Permission.READ_LATEST_CARDS)}>
                        <PacksStat project={project} />
                    </PermissionGate>
                </StatsGrid>
            )}
            {!project.draft && (
                <div className="flex flex-col md:flex-row gap-2 md:gap-4">
                    <PermissionGate requires={Permission.READ_PLAYTESTING_UPDATES}>
                        <ProjectPlaytestingUpdates project={project} className="md:flex-1 min-w-0" />
                    </PermissionGate>
                    <PermissionGate requires={[Permission.READ_REVIEWS, Permission.READ_CARDS]}>
                        <ProjectPlaytestingFocus project={project} className="md:flex-1 min-w-0" />
                    </PermissionGate>
                </div>
            )}
        </div>
    );
};

type ProjectHeaderProps = Omit<BaseElementProps, "children"> & {
    project: IProject,
    onEdit?: () => void,
    onDelete?: () => void
};

function CardChangesStat({ project }: ProjectStatProps) {
    const { data, isLoading } = useGetCardsQuery({ filter: { project: project.number, version: { $ne: "1.0.0" } } });

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
            <div className="bg-content2/50 px-5 py-5 border-b-2 space-y-2">
                <Skeleton className="h-4 w-32 rounded-sm"/>
                <Skeleton className="h-12 w-28 rounded-sm"/>
                <Skeleton className="h-4 w-42 rounded-sm" />
            </div>
        );
    }
    return (
        <div className="bg-content2/50 px-5 py-5">
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