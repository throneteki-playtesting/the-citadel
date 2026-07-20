import { BaseElementProps } from "../../types";
import { Button, Link } from "@heroui/react";
import { IProject } from "common/models/projects";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faBoxArchive, faPencil, faTrash } from "@fortawesome/free-solid-svg-icons";
import PermissionGate from "../../components/permissionGate";
import Permission from "common/models/permissions";
import classNames from "classnames";
import ProjectHeaderDraftNotice from "./draft/projectHeaderDraftNotice";
import { useMemo, ReactNode } from "react";
import { TouchTooltip } from "../../components/touchTooltip";
import ProjectImageStatus from "../../components/status/projectImageStatus";

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
                    <PermissionGate requires={Permission.SYNC_CARD_IMAGES}>
                        <ProjectImageStatus project={project.number} />
                    </PermissionGate>
                    {(project.draft || project.active) &&
                    <PermissionGate requires={Permission.EDIT_PROJECTS}>
                        <TouchTooltip content="Edit Project">
                            <Button isIconOnly onPress={onEdit}>
                                <FontAwesomeIcon icon={faPencil}/>
                            </Button>
                        </TouchTooltip>
                    </PermissionGate>
                    }
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
        </div>
    );
};

type ProjectHeaderProps = Omit<BaseElementProps, "children"> & {
    project: IProject,
    onEdit?: () => void,
    onDelete?: () => void
};

export default ProjectHeader;
