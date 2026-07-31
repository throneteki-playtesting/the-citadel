import { useMemo } from "react";
import { Chip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAngleLeft, faFlag } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { useNavigate } from "react-router-dom";
import { getFinalCardNumber, parseCardCode } from "common/utils";
import { IProject } from "common/models/projects";
import Permission from "common/models/permissions";
import { useGetProjectQuery, useGetSlotQuery } from "../../api";
import { usePermission } from "../../hooks/usePermission";
import { BaseElementProps } from "../../types";
import { TouchTooltip } from "../../components/touchTooltip";
import TooltipDetail from "../../components/tooltipDetail";
import PermissionedLink from "../../components/permissionedLink";
import { highlightTarget, releaseStatusColors } from "../../constants";

// One row of parts re-ordered by breakpoint rather than two layouts: on mobile the project and card
// number sit on one line with the chips wrapped beneath, while from sm up the chips move up beside
// the project and the number claims a line of its own.
export default function CardHeader({ className, style, project: projectNumber, number }: CardHeaderProps) {
    const { data: project } = useGetProjectQuery({ number: projectNumber });

    return (
        <div className={classNames("flex flex-wrap items-baseline gap-x-2", className)} style={style}>
            <PermissionedLink
                to={`/project/${projectNumber}`}
                className="order-1 text-lg sm:text-2xl tracking-widest text-secondary font-cinzel leading-tight hover:brightness-150 w-fit"
                requires={Permission.READ_PROJECTS}
            >
                <FontAwesomeIcon icon={faAngleLeft} /> {project?.name}
            </PermissionedLink>
            <div className="order-2 sm:order-3 sm:basis-full text-xl sm:text-4xl tracking-wider font-cinzel font-semibold text-primary">
                <span className="hidden sm:inline">Playtesting Card </span>#
                {parseCardCode(false, projectNumber, number)}
            </div>
            <div className="order-3 sm:order-2 basis-full sm:basis-auto flex flex-wrap items-center gap-1 empty:hidden">
                <ReleaseChip project={project} number={number} />
            </div>
        </div>
    );
}

type CardHeaderProps = Omit<BaseElementProps, "children"> & { project: number; number: number };

// Continues the breadcrumb: which release this card sits in, coloured by how far that release has
// got. Absent until the card is placed in one; the pack name & print number live in the tooltip.
function ReleaseChip({ className, style, project, number }: ReleaseChipProps) {
    const navigate = useNavigate();
    const canReadReleases = usePermission(Permission.READ_RELEASES);
    const { data: slot } = useGetSlotQuery(
        { project: project?.number ?? 0, number },
        { skip: !canReadReleases || !project }
    );

    const release = useMemo(
        () => slot?.release && project?.releases.find((entry) => entry.code === slot.release?.code),
        [project?.releases, slot?.release]
    );

    if (!project || !slot?.release || !release) {
        return null;
    }

    // Publishing sets releasedDate without necessarily moving status off its last working value
    const displayStatus = release.releasedDate ? "released" : release.status;
    const finalNumber = getFinalCardNumber(project, slot);

    return (
        <TouchTooltip
            content={
                <TooltipDetail
                    heading={
                        <>
                            {release.name} {finalNumber !== undefined && `#${finalNumber}`}
                        </>
                    }
                >
                    {release.status === "released"
                        ? "This card has been released"
                        : "This card is scheduled for release"}
                </TooltipDetail>
            }
        >
            <Chip
                size="sm"
                variant="flat"
                color={releaseStatusColors[displayStatus]}
                className={classNames("cursor-pointer", className)}
                style={style}
                startContent={<FontAwesomeIcon icon={faFlag} className="ml-1" />}
                onClick={() =>
                    navigate(`/project/${project.number}?tab=releases`, {
                        state: { highlight: highlightTarget.release(project.number, release.code) }
                    })
                }
            >
                {release.code}
            </Chip>
        </TouchTooltip>
    );
}

type ReleaseChipProps = Omit<BaseElementProps, "children"> & {
    project?: IProject;
    number: number;
};
