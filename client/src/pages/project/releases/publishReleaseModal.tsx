import { useCallback, useEffect, useRef, useState } from "react";
import {
    addToast,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ScrollShadow,
    Spinner
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import Joi from "joi";
import { CardPreview } from "@agot/card-preview";
import { IProject, IProjectRelease } from "common/models/projects";
import { IPlaytestCard } from "common/models/cards";
import { ReleaseDate } from "common/models/shared";
import { generateReleaseImageUrl, getReleaseOffset, parseCardCode, Regex, renderPlaytestingCard } from "common/utils";
import { BaseElementProps } from "../../../types";
import { usePublishReleaseMutation } from "../../../api";
import { Wizard, WizardBack, WizardNext, WizardPage, WizardPages } from "../../../components/wizard";
import { TouchTooltip } from "../../../components/touchTooltip";
import TooltipDetail from "../../../components/tooltipDetail";

const publishSchema = Joi.object({ releasedDate: Joi.string().regex(Regex.ReleaseDate).required() });

type ImageStatus = "loading" | "found" | "notfound";

export default function PublishReleaseModal({
    isOpen,
    project,
    release,
    assignedCards,
    onClose: onModalClose,
    onSave
}: PublishReleaseModalProps) {
    const [publishRelease, { isLoading }] = usePublishReleaseMutation();
    // Keyed by card number rather than slot position, so a status survives the list re-rendering
    const [imageStatuses, setImageStatuses] = useState<Map<number, ImageStatus>>(new Map());

    const setImageStatus = useCallback((number: number, status: ImageStatus) => {
        setImageStatuses((prev) => {
            const next = new Map(prev);
            next.set(number, status);
            return next;
        });
    }, []);

    const notFoundCount = assignedCards.filter(({ card }) => imageStatuses.get(card.number) !== "found").length;
    // Nothing to publish yet counts as "not ready" rather than vacuously satisfied
    const allImagesFound = assignedCards.length > 0 && notFoundCount === 0;

    const onSubmit = async (data: { releasedDate: ReleaseDate }) => {
        try {
            const result = await publishRelease({
                project: project.number,
                code: release.code,
                releasedDate: data.releasedDate
            }).unwrap();
            onSave?.(result);
            onModalClose?.(true);
        } catch {
            addToast({
                title: "Failed to publish",
                color: "danger",
                description: "The release could not be published"
            });
        }
    };

    const today = new Date().toISOString().split("T")[0] as ReleaseDate;

    return (
        <Modal
            isOpen={isOpen}
            placement="center"
            size="3xl"
            // "inside" fights the Wizard's own auto-height sizing; the grid below scrolls itself instead
            scrollBehavior="outside"
            onOpenChange={(isOpen) => !isOpen && onModalClose?.(false)}
        >
            <ModalContent>
                {(onClose) => (
                    <Wizard schema={publishSchema} data={{ releasedDate: today }} onSubmit={onSubmit}>
                        <ModalHeader className="font-cinzel">Publish &apos;{release.name}&apos;</ModalHeader>
                        <ModalBody>
                            <WizardPages>
                                <WizardPage controlledData={{}}>
                                    <PackReviewPage
                                        project={project}
                                        release={release}
                                        assignedCards={assignedCards}
                                        imageStatuses={imageStatuses}
                                        setImageStatus={setImageStatus}
                                        notFoundCount={notFoundCount}
                                    />
                                </WizardPage>
                                <WizardPage>
                                    <ConfirmDatePage defaultDate={today} />
                                </WizardPage>
                            </WizardPages>
                        </ModalBody>
                        <ModalFooter>
                            <WizardBack onCancel={onClose} />
                            <WizardNext
                                isLoading={isLoading}
                                isDisabled={!allImagesFound}
                                color="primary"
                                submitContent="Publish"
                            />
                        </ModalFooter>
                    </Wizard>
                )}
            </ModalContent>
        </Modal>
    );
}

type PublishReleaseModalProps = Omit<BaseElementProps, "children"> & {
    isOpen: boolean;
    project: IProject;
    release: IProjectRelease;
    assignedCards: { position: number; card: IPlaytestCard }[];
    onClose?: (didPublish: boolean) => void;
    onSave?: (result: IProject) => void;
};

function PackReviewPage({
    project,
    release,
    assignedCards,
    imageStatuses,
    setImageStatus,
    notFoundCount
}: {
    project: IProject;
    release: IProjectRelease;
    assignedCards: { position: number; card: IPlaytestCard }[];
    imageStatuses: Map<number, ImageStatus>;
    setImageStatus: (number: number, status: ImageStatus) => void;
    notFoundCount: number;
}) {
    const offset = getReleaseOffset(project, release.code);

    return (
        <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground/60">
                Confirm this is the pack you intend to publish, and that every card within is as expected. If anything
                is amiss, close this and amend the pack itself first - nothing here can be edited from this page.
            </p>
            <div className="grid grid-cols-2 gap-3">
                <Field label="Code" value={release.code} />
                <Field label="Name" value={release.name} />
                {release.plannedDate && <Field label="Planned Date" value={release.plannedDate} />}
                {release.article?.url && (
                    <Field
                        label="Article"
                        value={
                            <a
                                href={release.article.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary underline"
                            >
                                {release.article.url}
                            </a>
                        }
                    />
                )}
            </div>
            {notFoundCount > 0 && (
                <div className="text-sm text-warning-600 bg-warning-50 border border-warning-200 rounded-md p-3">
                    {notFoundCount} of {assignedCards.length} release image{assignedCards.length === 1 ? "" : "s"} not
                    yet found - publishing is blocked until every card&apos;s official print image is live.
                </div>
            )}
            <ScrollShadow size={24} className="max-h-[50vh]">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pr-1">
                    {assignedCards.map(({ position, card }) => {
                        const finalNumber = offset + position;
                        const imageUrl = generateReleaseImageUrl(release.code, finalNumber, card.name);
                        const rendered = renderPlaytestingCard(card, {
                            top: parseCardCode(true, card.project, finalNumber),
                            middle: `${release.code} #${finalNumber}`,
                            bottom: `v${card.version}`
                        });
                        return (
                            <ReleaseImageTile
                                key={card.number}
                                url={imageUrl}
                                rendered={rendered}
                                status={imageStatuses.get(card.number) ?? "loading"}
                                onStatusChange={(status) => setImageStatus(card.number, status)}
                            />
                        );
                    })}
                </div>
            </ScrollShadow>
        </div>
    );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <div className="text-xs text-foreground/50">{label}</div>
            <div className="font-medium">{value}</div>
        </div>
    );
}

function ReleaseImageTile({
    url,
    rendered,
    status,
    onStatusChange
}: {
    url: string;
    rendered: ReturnType<typeof renderPlaytestingCard>;
    status: ImageStatus;
    onStatusChange: (status: ImageStatus) => void;
}) {
    // Kept fresh via ref so the effect below only restarts on url changes, not on every render
    const onStatusChangeRef = useRef(onStatusChange);
    onStatusChangeRef.current = onStatusChange;

    useEffect(() => {
        onStatusChangeRef.current("loading");
        const img = new Image();
        img.onload = () => onStatusChangeRef.current("found");
        img.onerror = () => onStatusChangeRef.current("notfound");
        img.src = url;
    }, [url]);

    // A plot's slot is sized to its own (landscape) shape, so the badge sits on its corner, not the empty space around it
    const isPlot = rendered.type === "plot";

    return (
        // Centers a plot's shorter slot within the row's full height
        <div className="h-full flex items-center justify-center">
            <div
                className={classNames(
                    "relative w-full rounded-md bg-content2 overflow-hidden",
                    isPlot ? "aspect-[333/240]" : "aspect-[240/333]",
                    status === "loading" && "border-2 border-dashed border-content3 flex items-center justify-center"
                )}
            >
                {status !== "loading" && (
                    <div className="absolute top-1 right-1 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-content1/80">
                        <TouchTooltip
                            content={
                                <TooltipDetail
                                    heading={status === "found" ? "Release image found" : "Release image not found"}
                                >
                                    <span className="break-all">{url}</span>
                                </TooltipDetail>
                            }
                            size="sm"
                        >
                            <FontAwesomeIcon
                                icon={status === "found" ? faCheck : faXmark}
                                className={status === "found" ? "text-success" : "text-danger"}
                            />
                        </TouchTooltip>
                    </div>
                )}
                {status === "loading" && <Spinner size="lg" />}
                {status === "found" && <img src={url} alt={rendered.name} className="w-full h-full object-contain" />}
                {status === "notfound" && <CardPreview card={rendered} className="w-full" />}
            </div>
        </div>
    );
}

function ConfirmDatePage({ defaultDate }: { defaultDate: ReleaseDate }) {
    return (
        <div className="flex flex-col gap-3">
            <Input type="date" name="releasedDate" label="Release Date" defaultValue={defaultDate} isRequired />
            <div className="text-sm text-warning-600 bg-warning-50 border border-warning-200 rounded-md p-3">
                Once sealed, a pack cannot be reopened or altered - not its capacity, not its cards - without an
                administrator&apos;s hand.
            </div>
        </div>
    );
}
