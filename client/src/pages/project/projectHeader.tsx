import { BaseElementProps } from "../../types";
import { Link } from "@heroui/react";
import { IProject } from "common/models/projects";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faBoxArchive, faPencil, faTrash } from "@fortawesome/free-solid-svg-icons";
import Permission from "common/models/permissions";
import { usePermission } from "../../hooks/usePermission";
import classNames from "classnames";
import ProjectHeaderDraftNotice from "./draft/projectHeaderDraftNotice";
import ProjectProgressMeter from "../../components/projectProgressMeter";
import { useMemo, ReactNode } from "react";
import HeaderActions from "../../components/actions/headerActions";
import { statusActionItem } from "../../components/actions/statusActionItem";
import { useProjectImageStatus } from "../../components/status/useProjectImageStatus";

const ProjectHeader = ({
    className,
    style,
    project,
    onEdit = () => true,
    onDelete = () => true
}: ProjectHeaderProps) => {
    const canSyncImages = usePermission(Permission.SYNC_CARD_IMAGES);
    const canEdit = usePermission(Permission.EDIT_PROJECTS) && (project.draft || project.active);
    const canDelete = usePermission(Permission.DELETE_PROJECTS) && project.draft && !project.active;
    const canArchive = usePermission(Permission.ARCHIVE_PROJECTS) && !project.draft && project.active;

    const { data: imageStatus, isLoading: isImageStatusLoading } = useProjectImageStatus(project.number);

    const headerComponents = useMemo(() => {
        const components: ReactNode[] = [
            <span key="number">#{project.number}</span>,
            <span key="type" className="uppercase">
                {project.type}
            </span>
        ];

        if (project.draft) {
            components.push(<span key="version">In Draft</span>);
        } else {
            components.push(<span key="version">{project.version} updates</span>);
        }

        if (project.mandateUrl) {
            components.push(
                <Link key="mandate" href={project.mandateUrl} className="cursor-pointer">
                    Mandate <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                </Link>
            );
        }

        return (
            <>
                {components.flatMap((node, i) =>
                    i === 0
                        ? [node]
                        : [
                              <span key={`sep-${i}`} className="mx-1">
                                  ·
                              </span>,
                              node
                          ]
                )}
            </>
        );
    }, [project.draft, project.mandateUrl, project.number, project.type, project.version]);

    return (
        <div className={classNames("px-4 md:px-0 space-y-2 md:space-y-4", className)} style={style}>
            <div className="flex flex-col gap-2">
                <div className="flex flex-row items-start justify-between gap-2">
                    <div className="text-xs tracking-widest font-cinzel uppercase text-foreground/40">
                        {headerComponents}
                    </div>
                    <HeaderActions
                        items={[
                            canSyncImages &&
                                statusActionItem("sync-images", imageStatus, {
                                    isLoading: isImageStatusLoading,
                                    keepOpen: true
                                }),
                            canEdit && {
                                key: "edit",
                                title: "Edit Project",
                                icon: <FontAwesomeIcon icon={faPencil} />,
                                onPress: onEdit
                            },
                            canDelete && {
                                key: "delete",
                                title: "Delete Project",
                                icon: <FontAwesomeIcon icon={faTrash} />,
                                color: "danger",
                                onPress: onDelete
                            },
                            canArchive && {
                                key: "archive",
                                title: "Archive Project",
                                icon: <FontAwesomeIcon icon={faBoxArchive} />,
                                color: "danger",
                                onPress: onDelete
                            }
                        ]}
                    />
                </div>
                <div className="flex flex-row items-end justify-between gap-6">
                    <div className="flex-1 min-w-0 font-semibold font-cinzel tracking-widest text-3xl sm:text-4xl">
                        {project.name}
                    </div>
                    <div className="hidden md:block w-64 shrink-0 pb-1">
                        <ProjectProgressMeter project={project.number} />
                    </div>
                </div>
            </div>
            {project.description && <div className="text-sm lg:text-medium py-1">{project.description}</div>}
            <div className="md:hidden">
                <ProjectProgressMeter project={project.number} />
            </div>
            {project.draft && <ProjectHeaderDraftNotice project={project} />}
        </div>
    );
};

type ProjectHeaderProps = Omit<BaseElementProps, "children"> & {
    project: IProject;
    onEdit?: () => void;
    onDelete?: () => void;
};

export default ProjectHeader;
