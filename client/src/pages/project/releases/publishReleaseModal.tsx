import { useEffect, useState } from "react";
import { addToast, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Spinner, Tooltip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import Joi from "joi";
import { CardPreview } from "@agot/card-preview";
import { IProject, IProjectRelease } from "common/models/projects";
import { IPlaytestCard } from "common/models/cards";
import { ReleaseDate } from "common/models/shared";
import { generateReleaseImageUrl, getReleaseOffset, parseCardCode, Regex, renderPlaytestingCard } from "common/utils";
import { BaseElementProps } from "../../../types";
import { usePublishReleaseMutation } from "../../../api";
import { Wizard, WizardBack, WizardNext, WizardPage, WizardPages } from "../../../components/wizard";

const publishSchema = Joi.object({ releasedDate: Joi.string().regex(Regex.ReleaseDate).required() });

export default function PublishReleaseModal({ isOpen, project, release, assignedCards, onClose: onModalClose, onSave }: PublishReleaseModalProps) {
    const [publishRelease, { isLoading }] = usePublishReleaseMutation();

    const onSubmit = async (data: { releasedDate: ReleaseDate }) => {
        try {
            const result = await publishRelease({ project: project.number, code: release.code, releasedDate: data.releasedDate }).unwrap();
            onSave?.(result);
            onModalClose?.(true);
        } catch {
            addToast({ title: "Failed to publish", color: "danger", description: "The release could not be published" });
        }
    };

    const today = new Date().toISOString().split("T")[0] as ReleaseDate;

    return (
        <Modal isOpen={isOpen} placement="center" size="3xl" scrollBehavior="inside" onOpenChange={(isOpen) => !isOpen && onModalClose?.(false)}>
            <ModalContent>
                {(onClose) => (
                    <Wizard schema={publishSchema} data={{ releasedDate: today }} onSubmit={onSubmit}>
                        <ModalHeader className="font-cinzel">Publish &apos;{release.name}&apos;</ModalHeader>
                        <ModalBody>
                            <WizardPages>
                                <WizardPage controlledData={{}}>
                                    <PackReviewPage project={project} release={release} assignedCards={assignedCards}/>
                                </WizardPage>
                                <WizardPage>
                                    <ConfirmDatePage defaultDate={today}/>
                                </WizardPage>
                            </WizardPages>
                        </ModalBody>
                        <ModalFooter>
                            <WizardBack onCancel={onClose}/>
                            <WizardNext isLoading={isLoading} color="primary" submitContent="Publish"/>
                        </ModalFooter>
                    </Wizard>
                )}
            </ModalContent>
        </Modal>
    );
};

type PublishReleaseModalProps = Omit<BaseElementProps, "children"> & {
    isOpen: boolean;
    project: IProject;
    release: IProjectRelease;
    assignedCards: { position: number, card: IPlaytestCard }[];
    onClose?: (didPublish: boolean) => void;
    onSave?: (result: IProject) => void;
}

function PackReviewPage({ project, release, assignedCards }: { project: IProject, release: IProjectRelease, assignedCards: { position: number, card: IPlaytestCard }[] }) {
    const offset = getReleaseOffset(project, release.code);

    return (
        <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground/60">
                Confirm this is the pack you intend to publish, and that every card within is as expected. If anything is amiss, close this and amend the pack itself first - nothing here can be edited from this page.
            </p>
            <div className="grid grid-cols-2 gap-3">
                <Field label="Code" value={release.code}/>
                <Field label="Name" value={release.name}/>
                {release.plannedDate && <Field label="Planned Date" value={release.plannedDate}/>}
                {release.article?.url && (
                    <Field label="Article" value={<a href={release.article.url} target="_blank" rel="noreferrer" className="text-primary underline">{release.article.url}</a>}/>
                )}
            </div>
            <div className="max-h-[60vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {assignedCards.map(({ position, card }) => {
                        const finalNumber = offset + position;
                        const imageUrl = generateReleaseImageUrl(release.code, finalNumber, card.name);
                        const rendered = renderPlaytestingCard(card, {
                            top: parseCardCode(true, card.project, finalNumber),
                            middle: `${release.code} #${finalNumber}`,
                            bottom: `v${card.version}`
                        });
                        return (
                            <div key={card.number} className="relative">
                                <div className="absolute top-1 right-1 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-content1/80">
                                    <ReleaseImageStatus url={imageUrl}/>
                                </div>
                                <CardPreview card={rendered} className="w-full"/>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function Field({ label, value }: { label: string, value: React.ReactNode }) {
    return (
        <div>
            <div className="text-xs text-foreground/50">{label}</div>
            <div className="font-medium">{value}</div>
        </div>
    );
}

function ReleaseImageStatus({ url }: { url: string }) {
    const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

    useEffect(() => {
        setStatus("loading");
        const img = new Image();
        img.onload = () => setStatus("ok");
        img.onerror = () => setStatus("error");
        img.src = url;
    }, [url]);

    if (status === "loading") {
        return <Spinner size="sm"/>;
    }

    return (
        <Tooltip content={status === "ok" ? "Release image found" : "Release image could not be found"}>
            <FontAwesomeIcon icon={status === "ok" ? faCheck : faXmark} className={status === "ok" ? "text-success" : "text-danger"}/>
        </Tooltip>
    );
}

function ConfirmDatePage({ defaultDate }: { defaultDate: ReleaseDate }) {
    return (
        <div className="flex flex-col gap-3">
            <Input type="date" name="releasedDate" label="Release Date" defaultValue={defaultDate} isRequired/>
            <div className="text-sm text-warning-600 bg-warning-50 border border-warning-200 rounded-md p-3">
                Once sealed, a pack cannot be reopened or altered - not its capacity, not its cards - without an administrator&apos;s hand.
            </div>
        </div>
    );
}
