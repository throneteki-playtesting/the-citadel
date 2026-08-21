import { useEffect, useMemo, useState } from "react";
import { Button, Form, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowLeft,
    faCheck,
    faFloppyDisk,
    faPlus,
    faRotateLeft,
    faUpRightFromSquare
} from "@fortawesome/free-solid-svg-icons";
import { faCircleCheck } from "@fortawesome/free-regular-svg-icons";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Slot } from "common/models/schemas";
import { ArtworkStatus } from "common/models/slots";
import {
    artworkPrepFlags,
    artworkTypes,
    IArtworkProgress,
    isChecklistDone,
    statusReason,
    withAddedOption,
    withInferredStatus
} from "common/models/artwork";
import Permission from "common/models/permissions";
import { isDirty } from "common/utils";
import {
    useGetArtistsQuery,
    useGetCardsQuery,
    useGetSlotArtworkQuery,
    useUpdateSlotArtworkMutation
} from "../../../api";
import { usePermission } from "../../../hooks/usePermission";
import { useFormValidation } from "../../../hooks/useFormValidation";
import { showApiErrorToast } from "../../../api/errors";
import { artworkLane, EASE_STANDARD, laneSteps } from "../../../constants";
import StatusStepper from "../../../components/statusStepper";
import StatusNotice from "../../../components/statusNotice";
import ProcessActions, { ProcessAction } from "../../../components/actions/processActions";
import FormValidationSummary from "../../../components/formValidationSummary";
import ProductionLockAlert from "../productionLockAlert";
import AssigneeField from "./assigneeField";
import SourcedPanel from "./sourcedPanel";
import CommissionedPanel from "./commissionedPanel";
import AiPanel from "./aiPanel";
import PrepChecklist from "./prepChecklist";
import ArtworkChecklist from "./artworkChecklist";
import ConfirmStatusChangeModal from "./confirmStatusChangeModal";
import ArtworkTypePicker from "./artworkTypePicker";

const trackSteps = laneSteps(artworkLane);

// A modal's form opened from in here submits through this one too, so only our own submit is answered
const ARTWORK_FORM_ID = "artwork-form";

const TYPE_PANEL_TRAVEL = 16;
const PANEL_TRANSITION = { duration: 0.2, ease: EASE_STANDARD } as const;

export default function ArtworkTab({ project, number, showTrack, onBack }: ArtworkTabProps) {
    const navigate = useNavigate();
    const [pendingChange, setPendingChange] = useState<ArtworkStatus>();
    const { data: slotArtwork, isLoading } = useGetSlotArtworkQuery({ project, number });
    // The artwork is only meaningful against the card it is for, and this tab is reachable from the
    // project overview where nothing else on screen names it
    const { data: cardsData } = useGetCardsQuery({ filter: { project, number, latest: true } });
    const canEdit = usePermission(Permission.EDIT_ARTWORKS);
    const canReadArtists = usePermission(Permission.READ_ARTISTS);
    const { data: artistsData } = useGetArtistsQuery(undefined, { skip: !canReadArtists });
    const [updateSlotArtwork, { isLoading: isSaving }] = useUpdateSlotArtworkMutation();
    const { errors, validate, isValidationError, clearErrors } = useFormValidation(Slot.ArtworkProgress);

    const committed = slotArtwork?.artwork;
    const [draft, setDraft] = useState<IArtworkProgress>();

    // Reset whenever the stored artwork changes, so a save elsewhere isn't silently overwritten
    useEffect(() => {
        setDraft(committed ? { ...committed } : undefined);
        clearErrors();
    }, [committed, clearErrors]);

    const artists = useMemo(() => artistsData?.items ?? [], [artistsData?.items]);

    const isLockedByProduction = !!slotArtwork?.isLockedByProduction;
    const isEditable = canEdit && !isLockedByProduction;
    const draftIsDirty = isDirty(committed, draft);

    if (isLoading || !slotArtwork || !draft) {
        return <ArtworkTabSkeleton showTrack={showTrack} />;
    }

    // Every change re-derives the status, so the track follows the work rather than being driven by hand.
    // Nothing here is ever refused for it - the status is a consequence of the details, not a gate on them.
    const set = <K extends keyof IArtworkProgress>(key: K, value: IArtworkProgress[K]) =>
        setDraft((previous) => previous && withInferredStatus({ ...previous, [key]: value }, artists));

    // The status is carried separately from the draft, so a confirmation turned down leaves nothing behind
    const save = async (status: ArtworkStatus = draft.status) => {
        setPendingChange(undefined);
        try {
            await updateSlotArtwork({ project, number, ...draft, status }).unwrap();
        } catch (err) {
            if (!isValidationError(err)) {
                showApiErrorToast(err, { title: "Failed to update artwork" });
            }
        }
    };

    // A status moving is a statement about the card, so it is put to whoever is saving before it happens
    const onSave = () => {
        if (!validate(draft)) {
            return;
        }
        if (draft.status !== committed?.status) {
            setPendingChange(draft.status);
            return;
        }
        void save();
    };

    const onMarkComplete = () => {
        if (!validate(draft)) {
            return;
        }
        save("complete");
    };

    // Where the card stands, not where the draft would put it - a track cannot claim a save nobody made
    const savedStatus = committed?.status ?? draft.status;
    const step = artworkLane.meta[savedStatus];
    // Once the artwork is in hand how it was obtained is settled, reopened by dropping the status back
    const isTypeSettled = savedStatus === "confirming" || savedStatus === "complete";
    const card = cardsData?.items[0];
    const slotRef = { project, number };
    // Where each field's error goes - only the current type's panel is on screen, so errors elsewhere summarise
    const mappedPaths =
        draft.type === "sourced"
            ? (draft.sourced?.options ?? []).flatMap((_, index) => [
                  `sourced.options.${index}.url`,
                  `sourced.options.${index}.artist`
              ])
            : draft.type
              ? [`${draft.type}.url`]
              : [];
    const canSave = draftIsDirty && !isSaving;
    // Complete is never awarded by automation - offered here once the checklist, prep included, is clear
    const canComplete =
        isEditable && canReadArtists && committed?.status === "confirming" && isChecklistDone(draft, artists);

    const actions: ProcessAction[] = [];
    if (isEditable && draft.type === "sourced") {
        actions.push({
            key: "add-option",
            label: "Add option",
            icon: faPlus,
            variant: "flat",
            // It already has a home under the option list; only a phone needs it lifted out
            isMobileOnly: true,
            onPress: () => set("sourced", withAddedOption(draft.sourced))
        });
    }
    if (canEdit) {
        actions.push(
            {
                key: "discard",
                label: "Discard",
                icon: faRotateLeft,
                isDisabled: !draftIsDirty || isSaving,
                onPress: () => setDraft({ ...slotArtwork.artwork })
            },
            {
                key: "save",
                label: "Save changes",
                icon: faFloppyDisk,
                color: "primary",
                isDisabled: !canSave,
                onPress: onSave
            }
        );
    }

    return (
        <Form
            id={ARTWORK_FORM_ID}
            className="flex flex-col items-stretch gap-4 p-1 sm:p-2"
            validationErrors={errors}
            onSubmit={(e) => {
                if ((e.target as HTMLElement).id !== ARTWORK_FORM_ID) {
                    return;
                }
                e.preventDefault();
                onSave();
            }}
        >
            <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 min-w-0">
                    <Button
                        size="sm"
                        variant="light"
                        className="shrink-0 px-1 -ml-1 text-foreground/50"
                        startContent={<FontAwesomeIcon icon={onBack ? faArrowLeft : faUpRightFromSquare} />}
                        onPress={() => (onBack ? onBack() : navigate(`/project/${project}?tab=artworks`))}
                    >
                        All Artworks
                    </Button>
                    <div className="h-4 w-px shrink-0 bg-content3" />
                    <span className="text-xs text-foreground/40 tabular-nums">Card {number}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                    <h2 className="flex-1 min-w-0 font-cinzel text-xl sm:text-2xl tracking-wide truncate">
                        {card?.name ?? `Slot ${number}`}
                    </h2>
                    <AssigneeField
                        project={project}
                        number={number}
                        assignee={committed?.assignee}
                        isDisabled={!isEditable}
                    />
                </div>
            </div>
            {showTrack && (
                <StatusStepper
                    steps={trackSteps}
                    currentIndex={artworkLane.statuses.indexOf(savedStatus)}
                    color={artworkLane.color}
                    size="md"
                    className="w-full"
                />
            )}
            {isLockedByProduction && canEdit && <ProductionLockAlert lane="artwork" />}
            <div className="flex flex-col">
                {canReadArtists ? (
                    <ArtworkChecklist artwork={draft} artists={artists} />
                ) : (
                    <StatusNotice icon={step.icon} label={step.label} detail={step.description} />
                )}
                <AnimatePresence>
                    {canComplete && (
                        <motion.div
                            key="complete-status"
                            className="overflow-hidden"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: EASE_STANDARD }}
                        >
                            <StatusNotice
                                icon={faCircleCheck}
                                color="info"
                                label="Ready to sign off"
                                detail="This artwork is ready to be marked as complete — this action can be reverted."
                                className="mt-2"
                            >
                                <Button
                                    size="sm"
                                    color="success"
                                    variant="flat"
                                    className="shrink-0"
                                    isDisabled={isSaving}
                                    startContent={<FontAwesomeIcon icon={faCheck} />}
                                    onPress={onMarkComplete}
                                >
                                    Mark complete
                                </Button>
                            </StatusNotice>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <ArtworkTypePicker
                value={draft.type}
                isDisabled={!isEditable}
                isLocked={isTypeSettled}
                onChange={(type) => {
                    clearErrors();
                    set("type", type);
                }}
            />
            <AnimatePresence mode="wait" initial={false}>
                {draft.type && (
                    <motion.div
                        key={draft.type}
                        className="flex flex-col gap-3"
                        initial={{ opacity: 0, y: -TYPE_PANEL_TRAVEL }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -TYPE_PANEL_TRAVEL }}
                        transition={PANEL_TRANSITION}
                    >
                        {draft.type === "sourced" && (
                            <SourcedPanel
                                sourced={draft.sourced}
                                artists={artists}
                                slot={slotRef}
                                isDisabled={!isEditable}
                                onAdd={() => set("sourced", withAddedOption(draft.sourced))}
                                onChange={(sourced) => {
                                    // Errors are addressed by index, so adding/removing an option renames the rest
                                    if (sourced.options.length !== (draft.sourced?.options.length ?? 0)) {
                                        clearErrors();
                                    }
                                    set("sourced", sourced);
                                }}
                            />
                        )}
                        {draft.type === "commissioned" && (
                            <CommissionedPanel
                                commissioned={draft.commissioned}
                                slot={slotRef}
                                isDisabled={!isEditable}
                                onChange={(commissioned) => set("commissioned", commissioned)}
                            />
                        )}
                        {draft.type === "ai" && (
                            <AiPanel ai={draft.ai} isDisabled={!isEditable} onChange={(ai) => set("ai", ai)} />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
            {draft.type && (
                <PrepChecklist prep={draft.prep} isDisabled={!isEditable} onChange={(prep) => set("prep", prep)} />
            )}
            <FormValidationSummary errors={errors} mappedPaths={mappedPaths} />
            <ProcessActions actions={actions} className="pt-2" />
            <ConfirmStatusChangeModal
                isOpen={!!pendingChange && !!committed}
                from={committed?.status ?? "pending"}
                to={pendingChange ?? "pending"}
                reason={statusReason(draft, artists)}
                isSaving={isSaving}
                onConfirm={() => void save(pendingChange)}
                onCancel={() => setPendingChange(undefined)}
            />
        </Form>
    );
}

// The tab's own shape while it loads, holding the layout it is about to become rather than one block
function ArtworkTabSkeleton({ showTrack }: { showTrack?: boolean }) {
    return (
        <div className="flex flex-col gap-4 p-1 sm:p-2">
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-40 rounded-sm" />
                <Skeleton className="h-7 w-64 rounded-sm" />
            </div>
            {showTrack && <Skeleton className="h-12 w-full rounded-md" />}
            <Skeleton className="h-8 w-full rounded-md" />
            <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-48 rounded-sm" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {artworkTypes.map((type) => (
                        <Skeleton key={type} className="h-20 w-full rounded-md" />
                    ))}
                </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
                <Skeleton className="w-full sm:w-64 aspect-square shrink-0 rounded-md" />
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[0, 1, 2, 3].map((field) => (
                        <Skeleton key={field} className="h-14 w-full rounded-md" />
                    ))}
                    <Skeleton className="h-20 w-full sm:col-span-2 rounded-md" />
                </div>
            </div>
            <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-32 rounded-sm" />
                <div className="flex flex-wrap gap-2">
                    {artworkPrepFlags.map((flag) => (
                        <Skeleton key={flag} className="h-8 w-32 rounded-md" />
                    ))}
                </div>
            </div>
        </div>
    );
}

type ArtworkTabProps = {
    project: number;
    number: number;
    /** For the project's editor, which has no card progress above it to read the track from */
    showTrack?: boolean;
    /** Where "All Artworks" leads when the list is already on screen; otherwise it navigates to it */
    onBack?: () => void;
};
