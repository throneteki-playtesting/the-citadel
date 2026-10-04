import { Button, Skeleton, Tooltip } from "@heroui/react";
import Permission from "common/models/permissions";
import PermissionGate from "../../../components/permissionGate";
import { IProject } from "common/models/projects";
import { initialisationRequirements, unmetRequirement } from "common/models/initialisation";
import { BaseElementProps } from "../../../types";
import { useMemo, useState } from "react";
import { useGetCardsQuery, useGetSlotsQuery } from "../../../api";
import { faCircleCheck } from "@fortawesome/free-regular-svg-icons";
import { faCircleQuestion, faListCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import StatusNotice from "../../../components/statusNotice";
import { ChecklistItems } from "../../../components/checklist";
import { AnimatePresence, motion } from "framer-motion";
import { NOTICE_TRANSITION } from "../../../constants";
import InitialiseProjectModal from "./initialiseProjectModal";
import DraftingGuideModal from "./draftingGuideModal";
import { usePermission } from "../../../hooks/usePermission";
import { useTabGuideModal } from "../../../hooks/useTabGuideModal";

const DRAFTING_GUIDE_SEEN_KEY = "drafting-guide-seen";

// One per checklist row, at varied widths so the placeholder reads as lines of text
const SKELETON_ROW_WIDTHS = ["w-40", "w-36", "w-44", "w-56"];

export default function ProjectHeaderDraftNotice({ className, project }: ProjectHeaderDraftNoticeProps) {
    const { data: cardsData } = useGetCardsQuery({ filter: { project: project.number, draft: true } });
    const { data: slotsData } = useGetSlotsQuery({ project: project.number });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const canDraft = usePermission(Permission.CREATE_CARDS);
    const guide = useTabGuideModal(DRAFTING_GUIDE_SEEN_KEY, canDraft);

    const requirements = useMemo(
        () => cardsData && slotsData && initialisationRequirements(project, slotsData.items, cardsData.items),
        [cardsData, slotsData, project]
    );
    const isReady = !!requirements && !unmetRequirement(requirements);

    return (
        <StatusNotice
            icon={isReady ? faCircleCheck : faListCheck}
            color={isReady ? "success" : "neutral"}
            label="Initialisation checklist"
            className={className}
            detail={
                requirements ? (
                    <ChecklistItems items={requirements} />
                ) : (
                    <div className="flex flex-col gap-1.5 pt-1">
                        {SKELETON_ROW_WIDTHS.map((width) => (
                            <Skeleton key={width} className={classNames("h-3.5 rounded-md", width)} />
                        ))}
                    </div>
                )
            }
        >
            {canDraft && (
                <>
                    <Tooltip content="Drafting Guide">
                        <Button
                            isIconOnly
                            color="primary"
                            variant="flat"
                            size="sm"
                            aria-label="Drafting Guide"
                            className="shrink-0"
                            onPress={guide.open}
                        >
                            <FontAwesomeIcon icon={faCircleQuestion} />
                        </Button>
                    </Tooltip>
                    <DraftingGuideModal isOpen={guide.isOpen} onClose={guide.close} />
                </>
            )}
            <PermissionGate requires={Permission.INITIALISE_PROJECTS}>
                <AnimatePresence initial={false}>
                    {isReady && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={NOTICE_TRANSITION}
                            className="shrink-0"
                        >
                            <Button
                                size="sm"
                                color="success"
                                className="w-full sm:w-auto font-cinzel font-semibold sm:h-12 sm:px-6 sm:text-base"
                                onPress={() => setIsModalOpen(true)}
                            >
                                Initialise Project…
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
                <InitialiseProjectModal
                    isOpen={isModalOpen}
                    project={project}
                    cards={cardsData?.items ?? []}
                    isReady={isReady}
                    onClose={() => setIsModalOpen(false)}
                />
            </PermissionGate>
        </StatusNotice>
    );
}

type ProjectHeaderDraftNoticeProps = Omit<BaseElementProps, "children" | "style"> & {
    project: IProject;
};
