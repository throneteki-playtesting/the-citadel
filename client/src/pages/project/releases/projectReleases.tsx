import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleQuestion } from "@fortawesome/free-solid-svg-icons";
import { IProject } from "common/models/projects";
import Permission from "common/models/permissions";
import { usePermission } from "../../../hooks/usePermission";
import { useTabGuideModal } from "../../../hooks/useTabGuideModal";
import CycleReleases from "./cycleReleases";
import ExpansionRelease from "./expansionRelease";
import ReleasesGuideModal from "./releasesGuideModal";

const RELEASES_GUIDE_SEEN_KEY = "releases-guide-seen";

// Cycles plan multiple sequenced packs from a development pool; expansions have a single fixed release
export default function ProjectReleases({ project, isActive }: ProjectReleasesProps) {
    const canEditReleases = usePermission(Permission.EDIT_RELEASES);
    const guide = useTabGuideModal(RELEASES_GUIDE_SEEN_KEY, isActive && canEditReleases);

    // Handed down rather than rendered here, so each lands beside its own variant's page title/description
    const guideButton = canEditReleases && (
        <Button
            color="primary"
            variant="flat"
            size="sm"
            startContent={<FontAwesomeIcon icon={faCircleQuestion} />}
            onPress={guide.open}
            className="hidden sm:flex font-cinzel shrink-0 font-semibold"
        >
            Release Guide
        </Button>
    );
    const guideIconButton = canEditReleases && (
        <Button
            isIconOnly
            color="primary"
            variant="flat"
            size="sm"
            aria-label="Release Guide"
            onPress={guide.open}
            className="sm:hidden shrink-0"
        >
            <FontAwesomeIcon icon={faCircleQuestion} />
        </Button>
    );

    return (
        <>
            {project.type === "expansion" ? (
                <ExpansionRelease project={project} guideButton={guideButton} guideIconButton={guideIconButton} />
            ) : (
                <CycleReleases
                    project={project}
                    isActive={isActive}
                    guideButton={guideButton}
                    guideIconButton={guideIconButton}
                />
            )}
            {canEditReleases && <ReleasesGuideModal isOpen={guide.isOpen} onClose={guide.close} />}
        </>
    );
}

type ProjectReleasesProps = {
    project: IProject;
    isActive: boolean;
};
