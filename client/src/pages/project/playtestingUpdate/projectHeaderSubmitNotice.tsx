import { addToast, Alert, Button } from "@heroui/react";
import { BaseElementProps } from "../../../types";
import CreatePlaytestingUpdateModal from "./createPlaytestingUpdateModal";
import { useMemo, useState } from "react";
import { IProject } from "common/models/projects";
import { useGetCardsQuery } from "../../../api";

const ProjectHeaderPlaytestingUpdateNotice = ({ className, style, project }: ProjectHeaderPlaytestingUpdateNoticeProps) => {
    const { data: draftsData, isLoading: isDraftsLoading } = useGetCardsQuery({ filter: { project: project?.number, draft: true } }, { skip: !project });
    const [isModalOpen, setIsModalOpen] = useState(false);

    const draftCards = useMemo(() => draftsData?.items ?? [], [draftsData?.items]);

    return (
        <>
            {!isDraftsLoading && draftCards.length > 0 && (
                <Alert color="primary" title="Playtesting Updates Available" classNames={{ title: "font-bold text-sm md:text-md lg:text-lg" }} className={className} style={style}>
                    <div className="text-xs md:text-sm lg:text-md italic">
                        {draftCards.length} draft card changes found. To push these changes to playtesters, a Playtesting Update must be created & submitted.
                    </div>
                    <Button variant="flat" className="mt-2 w-full md:text-lg font-bold" onPress={() => setIsModalOpen(true)}>Create Playtesting Update</Button>
                </Alert>
            )}
            <CreatePlaytestingUpdateModal isOpen={isModalOpen} project={project} onClose={() => setIsModalOpen(false)} onSave={(playtestingUpdate) => addToast({ title: "Successfully submitted", color: "success", description: `${project.code} Playtesting Update #${playtestingUpdate.version} has been submitted` })}/>
        </>
    );
};

type ProjectHeaderPlaytestingUpdateNoticeProps = Omit<BaseElementProps, "children"> & { project: IProject }

export default ProjectHeaderPlaytestingUpdateNotice;