import { BaseElementProps } from "../../types";
import { Button, ButtonGroup, Chip, CircularProgress, Divider, Link, Skeleton } from "@heroui/react";
import dismoji from "../../emojis";
import { useMemo } from "react";
import { IProject } from "common/models/projects";
import { IPlaytestCard } from "common/models/cards";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faPencil, faX } from "@fortawesome/free-solid-svg-icons";
import PermissionGate from "../../components/permissionGate";
import { Permission } from "common/models/user";
import classNames from "classnames";
import ProjectHeaderDraftNotice from "./draft/projectHeaderDraftNotice";

const ProjectHeader = ({ className, style, project, cards, isLoading = false, onEdit = () => true, onDelete = () => true }: ProjectHeaderProps) => {
    // TODO: Placeholder values, will use IProjectCardProduction
    const percents = useMemo(() => ({
        artwork: 0.7,
        wording: 0.2,
        completed: 0.1
    }), []);

    if (!project || isLoading) {
        return (
            <div className={classNames("flex flex-col gap-2", className)} style={style}>
                <Skeleton className="h-4 sm:h-5 md:h-6 w-42 sm:w-64 rounded-lg"/>
                <Skeleton className="h-4 sm:h-5 md:h-6 w-36 sm:w-52 rounded-lg"/>
                <Skeleton className="h-4 sm:h-5 md:h-6 w-52 sm:w-74 rounded-lg"/>
            </div>
        );
    }
    const title = project.emoji ? `${dismoji[project.emoji.replaceAll(":", "")]} ${project.name}` : project.name;
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
            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
                <div className="text-2xl md:text-3xl lg:text-4xl">{title}</div>
                <div className="space-x-1">
                    <Chip variant="bordered" color="success" className="text-xs h-6">#{project.number}</Chip>
                    <Chip variant="bordered" color="secondary" className="text-xs h-6 capitalize">{project.type}</Chip>
                    <Chip variant="bordered" color="warning" className="text-xs h-6">{project.code}</Chip>
                </div>
            </div>
            {project.draft && cards && <ProjectHeaderDraftNotice project={project} cards={cards}/>}
            {project.description && <div className="text-sm md:text-lg lg:text-xl py-1">{project.description}</div>}
            <div className="w-fit flex flex-col">
                <Link href={project.mandateUrl} className="space-x-1 cursor-pointer">
                    <span className="text-md">Mandate</span>
                    <FontAwesomeIcon icon={faArrowUpRightFromSquare}/>
                </Link>
                <Divider className="my-1"/>
                <Link href={project.formUrl} className="space-x-1 cursor-pointer">
                    <span className="text-md">Submit Review</span>
                    <FontAwesomeIcon icon={faArrowUpRightFromSquare}/>
                </Link>
            </div>
            <div className="flex py-5">
                <CircularProgress
                    color="success"
                    valueLabel={<div className="flex flex-col justify-center text-center">
                        <div className="text-xl">{`${percents.artwork * 100}%`}</div>
                        <div className="text-md">Artwork</div>
                    </div>}
                    showValueLabel
                    strokeWidth={2}
                    classNames={{
                        svg: "w-24 h-24 drop-shadow-md"
                    }}
                    value={percents.artwork * 100}
                />
                <CircularProgress
                    color="success"
                    valueLabel={<div className="flex flex-col justify-center text-center">
                        <div className="text-xl">{`${percents.wording * 100}%`}</div>
                        <div className="text-md">Wording</div>
                    </div>}
                    showValueLabel
                    strokeWidth={2}
                    classNames={{
                        svg: "w-24 h-24 drop-shadow-md"
                    }}
                    value={percents.wording * 100}
                />
                <CircularProgress
                    color="success"
                    valueLabel={<div className="flex flex-col justify-center text-center">
                        <div className="text-xl">{`${percents.completed * 100}%`}</div>
                        <div className="text-md">Completed</div>
                    </div>}
                    showValueLabel
                    strokeWidth={2}
                    classNames={{
                        svg: "w-24 h-24 drop-shadow-md"
                    }}
                    value={percents.completed * 100}
                />
            </div>
        </div>
    );
};

type ProjectHeaderProps = Omit<BaseElementProps, "children"> & { project?: IProject, cards?: IPlaytestCard[], isLoading?: boolean, onEdit?: () => void, onDelete?: () => void };

export default ProjectHeader;