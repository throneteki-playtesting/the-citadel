import { BaseElementProps } from "../../types";
import { Button, ButtonGroup, Card, Link, Skeleton } from "@heroui/react";
import { IProject } from "common/models/projects";
import { IPlaytestCard } from "common/models/cards";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faPencil, faX } from "@fortawesome/free-solid-svg-icons";
import PermissionGate from "../../components/permissionGate";
import Permission from "common/models/permissions";
import classNames from "classnames";
import ProjectHeaderDraftNotice from "./draft/projectHeaderDraftNotice";
import ProjectPlaytestingUpdates from "./playtestingUpdate/projectPlaytestingUpdates";

const ProjectHeader = ({ className, style, project, cards, isLoading = false, onEdit = () => true, onDelete = () => true }: ProjectHeaderProps) => {
    if (!project || isLoading) {
        // TODO: Improve this once header details are more finalised
        return (
            <div className={classNames("flex flex-col gap-2", className)} style={style}>
                <Skeleton className="h-4 sm:h-5 md:h-6 w-42 sm:w-64 rounded-lg"/>
                <Skeleton className="h-4 sm:h-5 md:h-6 w-36 sm:w-52 rounded-lg"/>
                <Skeleton className="h-4 sm:h-5 md:h-6 w-52 sm:w-74 rounded-lg"/>
            </div>
        );
    }

    return (
        <Card className={classNames("p-4 bg-content1/10 space-y-2 md:space-y-4", className)} style={style}>
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
                <div className="text-xxs tracking-widest uppercase text-foreground/40">
                        #{project.number} · <span className="uppercase">{project.type} · {project.version} updates</span>{project.mandateUrl && (<> · <Link href={project.mandateUrl} className="cursor-pointer text-xxs">Mandate <FontAwesomeIcon icon={faArrowUpRightFromSquare}/></Link></>)}
                </div>
                <div className="font-semibold text-2xl lg:text-3xl">{project.name}</div>
            </div>
            {project.draft && cards && <ProjectHeaderDraftNotice project={project} cards={cards} className="w-1/2"/>}
            {project.description && <div className="text-sm lg:text-medium py-1">{project.description}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <ProjectPlaytestingUpdates project={project} />
            </div>
        </Card>
    );
};

type ProjectHeaderProps = Omit<BaseElementProps, "children"> & { project?: IProject, cards?: IPlaytestCard[], isLoading?: boolean, onEdit?: () => void, onDelete?: () => void };

export default ProjectHeader;