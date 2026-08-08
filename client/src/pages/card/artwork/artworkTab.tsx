import { useEffect, useMemo, useState } from "react";
import { Button, Form, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowLeft,
    faFloppyDisk,
    faPlus,
    faRotateLeft,
    faUpRightFromSquare
} from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";
import { isEqual } from "lodash-es";
import { Slot } from "common/models/schemas";
import { ArtworkStatus } from "common/models/slots";
import {
    artworkPrepFlags,
    IArtworkProgress,
    statusReason,
    withAddedOption,
    withInferredStatus
} from "common/models/artwork";
import Permission from "common/models/permissions";
import { useGetArtistsQuery, useGetCardsQuery, useGetSlotQuery, useUpdateSlotMutation } from "../../../api";
import { usePermission } from "../../../hooks/usePermission";
import { useFormValidation } from "../../../hooks/useFormValidation";
import { showApiErrorToast } from "../../../api/errors";
import { artworkLane, artworkTypeNames, laneSteps } from "../../../constants";
import StatusStepper from "../../../components/statusStepper";
import SectionTitle from "../../../components/sectionTitle";
import StatusNotice from "../../../components/statusNotice";
import ProcessActions, { ProcessAction } from "../../../components/actions/processActions";
import FormValidationSummary from "../../../components/formValidationSummary";
import ProductionLockAlert from "../productionLockAlert";
import SourcedPanel from "./sourcedPanel";
import CommissionedPanel from "./commissionedPanel";
import AiPanel from "./aiPanel";
import PrepChecklist from "./prepChecklist";
import ArtworkChecklist from "./artworkChecklist";
import ConfirmStatusChangeModal from "./confirmStatusChangeModal";
import ArtworkTypePicker from "./artworkTypePicker";

const trackSteps = laneSteps(artworkLane);

export default function ArtworkTab({ project, number, showTrack, onBack }: ArtworkTabProps) {
    const navigate = useNavigate();
    const [pendingChange, setPendingChange] = useState<ArtworkStatus>();
    const { data: slot, isLoading } = useGetSlotQuery({ project, number });
    // The artwork is only meaningful against the card it is for, and this tab is reachable from the
    // project overview where nothing else on screen names it
    const { data: cardsData } = useGetCardsQuery({ filter: { project, number, latest: true } });
    const canEdit = usePermission(Permission.EDIT_SLOTS);
    const canReadArtists = usePermission(Permission.READ_ARTISTS);
    const { data: artistsData } = useGetArtistsQuery(undefined, { skip: !canReadArtists });
    const [updateSlot, { isLoading: isSaving }] = useUpdateSlotMutation();
    const { errors, validate, isValidationError, clearErrors } = useFormValidation(Slot.ArtworkProgress);

    const committed = slot?.statuses.artwork;
    const [draft, setDraft] = useState<IArtworkProgress>();

    // Reset whenever the stored artwork changes, so a save elsewhere isn't silently overwritten
    useEffect(() => {
        setDraft(committed ? { ...committed } : undefined);
        clearErrors();
    }, [committed, clearErrors]);

    const artists = useMemo(() => artistsData?.items ?? [], [artistsData?.items]);

    // Artwork is frozen once a card file exists downstream of it
    const isLockedByProduction = !!slot && slot.statuses.production !== "waiting";
    const isEditable = canEdit && !isLockedByProduction;
    const isDirty = !!committed && !!draft && !isEqual(draft, committed);

    if (isLoading || !slot || !draft) {
        return <ArtworkTabSkeleton showTrack={showTrack} />;
    }

    // Every change re-derives the status, so the track follows the work rather than being driven by hand.
    // Nothing here is ever refused for it - the status is a consequence of the details, not a gate on them.
    const set = <K extends keyof IArtworkProgress>(key: K, value: IArtworkProgress[K]) =>
        setDraft((previous) => previous && withInferredStatus({ ...previous, [key]: value }, artists));

    const save = async () => {
        setPendingChange(undefined);
        try {
            await updateSlot({ project, number, statuses: { artwork: draft } }).unwrap();
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

    const step = artworkLane.meta[draft.status];
    const card = cardsData?.items[0];
    // Where each link's error goes. Only the current type's panel is on screen, so anything wrong in the
    // blocks kept beside it has no input to attach to and is summarised instead
    const mappedPaths =
        draft.type === "sourced"
            ? (draft.sourced?.options ?? []).map((_, index) => `sourced.options.${index}.url`)
            : draft.type
              ? [`${draft.type}.url`]
              : [];
    const canSave = isDirty && !isSaving;

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
                isDisabled: !isDirty || isSaving,
                onPress: () => setDraft({ ...slot.statuses.artwork })
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
            className="flex flex-col items-stretch gap-4 p-1 sm:p-2"
            validationErrors={errors}
            onSubmit={(e) => {
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
                    <span className="text-xs text-foreground/40 tabular-nums">Card {slot.number}</span>
                </div>
                <h2 className="font-cinzel text-xl sm:text-2xl tracking-wide truncate">
                    {card?.name ?? `Slot ${slot.number}`}
                </h2>
            </div>

            {showTrack && (
                <StatusStepper
                    steps={trackSteps}
                    currentIndex={artworkLane.statuses.indexOf(draft.status)}
                    color={artworkLane.color}
                    size="md"
                    className="w-full"
                />
            )}

            {isLockedByProduction && canEdit && <ProductionLockAlert lane="artwork" />}

            {canReadArtists ? (
                <ArtworkChecklist artwork={draft} artists={artists} />
            ) : (
                <StatusNotice icon={step.icon} label={step.label} detail={step.description} />
            )}

            <ArtworkTypePicker value={draft.type} isDisabled={!isEditable} onChange={(type) => set("type", type)} />

            {draft.type && (
                <div className="flex flex-col gap-3">
                    <SectionTitle>{artworkTypeNames[draft.type]}</SectionTitle>
                    {draft.type === "sourced" && (
                        <SourcedPanel
                            sourced={draft.sourced}
                            artists={artists}
                            isDisabled={!isEditable}
                            onAdd={() => set("sourced", withAddedOption(draft.sourced))}
                            onChange={(sourced) => set("sourced", sourced)}
                        />
                    )}
                    {draft.type === "commissioned" && (
                        <CommissionedPanel
                            commissioned={draft.commissioned}
                            isDisabled={!isEditable}
                            onChange={(commissioned) => set("commissioned", commissioned)}
                        />
                    )}
                    {draft.type === "ai" && (
                        <AiPanel ai={draft.ai} isDisabled={!isEditable} onChange={(ai) => set("ai", ai)} />
                    )}
                </div>
            )}

            <PrepChecklist prep={draft.prep} isDisabled={!isEditable} onChange={(prep) => set("prep", prep)} />

            <FormValidationSummary errors={errors} mappedPaths={mappedPaths} />

            <ProcessActions actions={actions} className="pt-2" />

            <ConfirmStatusChangeModal
                isOpen={!!pendingChange && !!committed}
                from={committed?.status ?? "pending"}
                to={pendingChange ?? "pending"}
                reason={statusReason(draft, artists)}
                isSaving={isSaving}
                onConfirm={save}
                onCancel={() => setPendingChange(undefined)}
            />
        </Form>
    );
}

/**
 * The tab's own shape while it loads. Reachable both from the card page and from the project's artwork
 * list, where it is what covers a card being swapped for another - so it has to hold the layout it is
 * about to become rather than a single block the real thing then shoves around.
 */
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
                    {[0, 1, 2].map((tile) => (
                        <Skeleton key={tile} className="h-20 w-full rounded-md" />
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
