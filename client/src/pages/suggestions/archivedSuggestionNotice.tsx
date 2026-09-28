import { Button } from "@heroui/react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faBoxArchive } from "@fortawesome/free-solid-svg-icons";
import { archiveReasonLabels, IArchivedInfo } from "common/models/cards";
import { useGetProjectsQuery } from "../../api";
import StatusNotice from "../../components/statusNotice";
import Timestamp from "../../components/timestamp";
import useUser from "../../hooks/useUser";

/** Why and when a suggestion was archived - and, where it went into a project, a way to the card it became. */
export default function ArchivedSuggestionNotice({ archived, className }: ArchivedSuggestionNoticeProps) {
    const { user: archivedBy } = useUser(archived.archivedBy);
    // The archive records the project by code, while its pages are addressed by number
    const { data: projects } = useGetProjectsQuery(
        { filter: { code: archived.project?.code } },
        { skip: !archived.project }
    );
    const projectNumber = projects?.items[0]?.number;

    const details = [
        archiveReasonLabels[archived.reason],
        archived.project && `became ${archived.project.code} #${archived.project.number}`,
        archived.details
    ].filter(Boolean);

    return (
        <StatusNotice
            icon={faBoxArchive}
            iconPosition="title"
            color="warning"
            label="Archived"
            detail={
                <div className="flex flex-col gap-0.5">
                    <span className="text-foreground/70">{details.join(" · ")}</span>
                    <span className="text-foreground/40">
                        <Timestamp date={archived.archivedAt} variant="long" inline />
                        {archived.archivedBy ? ` by ${archivedBy?.displayname ?? "…"}` : ", automatically"}
                    </span>
                </div>
            }
            className={className}
        >
            {archived.project && projectNumber !== undefined && (
                <Button
                    as={Link}
                    to={`/project/${projectNumber}/${archived.project.number}`}
                    size="sm"
                    variant="flat"
                    color="warning"
                    className="w-full shrink-0 sm:w-auto"
                    endContent={<FontAwesomeIcon icon={faArrowRight} />}
                >
                    View card
                </Button>
            )}
        </StatusNotice>
    );
}

type ArchivedSuggestionNoticeProps = {
    archived: IArchivedInfo;
    className?: string;
};
