import { useEffect, useMemo, useState } from "react";
import { Button, Chip, Skeleton, Tab, Tabs } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import classNames from "classnames";
import {
    faArrowLeft,
    faCircleCheck,
    faCircleDot,
    faFeatherPointed,
    faPlus,
    faTriangleExclamation,
    faUpRightFromSquare
} from "@fortawesome/free-solid-svg-icons";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { designPhase } from "common/models/slots";
import { IPlaytestCard } from "common/models/cards";
import {
    inquirySeverities,
    InquirySeverity,
    IRefinementInquiry,
    isInquiryOpen,
    isRefinementDone,
    refinementRequirements
} from "common/models/refinement";
import Permission from "common/models/permissions";
import {
    useDeleteInquiryMutation,
    useGetCardsQuery,
    useGetSlotRefinementQuery,
    useReopenInquiryMutation,
    useSubmitRefinementCheckMutation,
    useUpdateSlotMutation,
    useWithdrawRefinementCheckMutation
} from "../../../api";
import { usePermission } from "../../../hooks/usePermission";
import { ScopeParams, useSearchParamsScope } from "../../../hooks/useSearchParamsScope";
import { useIsPageActive } from "../../../hooks/useIsPageActive";
import { useAuth } from "../../../hooks/useAuth";
import { showApiErrorToast } from "../../../api/errors";
import { designLane, EASE_STANDARD, inquirySeverityMeta, laneSteps } from "../../../constants";
import StatusStepper from "../../../components/statusStepper";
import StatusNotice from "../../../components/statusNotice";
import ConfirmModal from "../../../components/confirmModal";
import SectionTitle from "../../../components/sectionTitle";
import { FilterChip, FilterRow } from "../../../components/filterChips";
import CardStack from "../../../components/cardStack";
import { useIsReleaseBound } from "../../../hooks/useIsReleaseBound";
import ProcessActions, { ProcessAction } from "../../../components/actions/processActions";
import RefinementChecklist from "./refinementChecklist";
import RefinementCheckControl from "./refinementCheckControl";
import InquiryCard from "./inquiryCard";
import InquiryModal from "./inquiryModal";
import ResolveInquiryModal from "./resolveInquiryModal";
import FaqSection from "./faqSection";
import { DraftActions, StackedVersion } from "../cardDetail";
import { versionLabel } from "../versionLabel";

const trackSteps = laneSteps(designLane);
const NOTICE_TRANSITION = { duration: 0.2, ease: EASE_STANDARD } as const;
const INQUIRY_URL_KEYS = ["severities", "open", "resolved"];

/**
 * Open and Resolved decide which inquiries are on the page at all, where the severity chips below only
 * narrow what is already there. Drawn softer than those, so the pair reads as part of the heading.
 */
function StateChip({ label, count, color, icon, isActive, onPress }: StateChipProps) {
    return (
        <Chip
            as="button"
            size="sm"
            radius="sm"
            variant={isActive ? "flat" : "bordered"}
            color={isActive ? color : "default"}
            className={classNames("shrink-0 cursor-pointer gap-1", !isActive && "opacity-60")}
            startContent={<FontAwesomeIcon icon={icon} className="ml-1.5" />}
            onClick={onPress}
        >
            <span className="tabular-nums">
                {count} {label}
            </span>
        </Chip>
    );
}

type StateChipProps = {
    label: string;
    count: number;
    color: "primary" | "success";
    icon: IconDefinition;
    isActive: boolean;
    onPress: () => void;
};

/**
 * A card's refinement, shared by the card page's own tab and the project list's editor. The list travels
 * to this rather than opening it in a dialog, for the same reason artwork does: it is far too tall to sit in one.
 */
export default function RefinementTab({ project, number, highlightInquiry, showTrack, onBack }: RefinementTabProps) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const isPageActive = useIsPageActive();
    const { user } = useAuth();
    const { data: refinement, isLoading, isFetching } = useGetSlotRefinementQuery({ project, number });
    const { data: cardsData } = useGetCardsQuery({ filter: { project, number, latest: true } });
    // A separate subscription rather than one unfiltered read - the tab only ever wants these two, and
    // both are already cached by the card page beside it
    const { data: draftsData } = useGetCardsQuery({ filter: { project, number, draft: true } });

    const canRaise = usePermission(Permission.RAISE_INQUIRIES);
    const canEditOthers = usePermission(Permission.EDIT_INQUIRIES);
    const canDeleteOthers = usePermission(Permission.DELETE_INQUIRIES);
    const canResolve = usePermission(Permission.RESOLVE_INQUIRIES);
    const canCheck = usePermission(Permission.SUBMIT_REFINEMENT_CHECK);
    const canReadFaq = usePermission(Permission.READ_FAQ);
    const canEditFaq = usePermission(Permission.EDIT_FAQ);
    const canEditSlot = usePermission(Permission.EDIT_SLOTS);

    const [submitCheck, { isLoading: isChecking }] = useSubmitRefinementCheckMutation();
    const [withdrawCheck, { isLoading: isWithdrawing }] = useWithdrawRefinementCheckMutation();
    const [deleteInquiry, { isLoading: isDeleting }] = useDeleteInquiryMutation();
    const [reopenInquiry, { isLoading: isReopening }] = useReopenInquiryMutation();
    const [updateSlot, { isLoading: isCompleting }] = useUpdateSlotMutation();

    const [editing, setEditing] = useState<IRefinementInquiry>();
    const [isRaising, setIsRaising] = useState(false);
    const [resolving, setResolving] = useState<IRefinementInquiry>();
    const [deleting, setDeleting] = useState<IRefinementInquiry>();
    const [reopening, setReopening] = useState<IRefinementInquiry>();
    const [severities, setSeverities] = useState<InquirySeverity[]>(() =>
        (searchParams.get("severities")?.split(",") ?? []).filter((entry): entry is InquirySeverity =>
            inquirySeverities.includes(entry as InquirySeverity)
        )
    );
    // Both on by default: an inquiry and the answer to it are the same record, and a list which hid what
    // was settled would read as though it had never been raised
    const [showOpen, setShowOpen] = useState(() => searchParams.get("open") !== "false");
    const [showResolved, setShowResolved] = useState(() => searchParams.get("resolved") !== "false");

    // Its own slice of the url, registered under its own keys - the project's Refinements list filters the
    // same vocabulary one level up, and the two must be able to sit in the same address without collision
    const scopeParams = useMemo((): ScopeParams => {
        const params: ScopeParams = Object.fromEntries(INQUIRY_URL_KEYS.map((key) => [key, undefined]));
        if (severities.length > 0) {
            params.severities = severities.join(",");
        }
        if (!showOpen) {
            params.open = "false";
        }
        if (!showResolved) {
            params.resolved = "false";
        }
        return params;
    }, [severities, showOpen, showResolved]);
    useSearchParamsScope("inquiries", isPageActive, scopeParams);

    const inquiries = useMemo(() => refinement?.inquiries ?? [], [refinement?.inquiries]);
    const open = useMemo(() => inquiries.filter(isInquiryOpen), [inquiries]);
    const resolved = useMemo(() => inquiries.filter((entry) => !isInquiryOpen(entry)), [inquiries]);

    // Resolved ones sit in the run where their number puts them rather than in a section of their own -
    // an inquiry and the answer to it are the same record, and splitting them reads as two lists
    const visible = useMemo(
        () =>
            inquiries.filter(
                (entry) =>
                    (isInquiryOpen(entry) ? showOpen : showResolved) &&
                    (severities.length === 0 || severities.includes(entry.severity))
            ),
        [inquiries, showOpen, showResolved, severities]
    );

    // Each severity counts only what the state chips already let through, so pressing one can never
    // produce a list shorter than the number that invited the press
    const severityCounts = useMemo(() => {
        const counts = Object.fromEntries(inquirySeverities.map((entry) => [entry, 0])) as Record<
            InquirySeverity,
            number
        >;
        for (const entry of inquiries) {
            if (isInquiryOpen(entry) ? showOpen : showResolved) {
                counts[entry.severity]++;
            }
        }
        return counts;
    }, [inquiries, showOpen, showResolved]);

    const requirements = useMemo(
        () => refinementRequirements(inquiries, refinement?.refinementChecks ?? [], refinement?.version),
        [inquiries, refinement?.refinementChecks, refinement?.version]
    );

    if (isLoading || !refinement) {
        return <RefinementTabSkeleton showTrack={showTrack} />;
    }

    const card = cardsData?.items[0];
    const draft = draftsData?.items[0];
    // The card everything here is measured against, picked by matching the version the server sent rather
    // than by re-deciding draft-or-latest client side - there is one answer to that and the server owns it
    const measuredCard = draft?.version === refinement.version ? draft : card;
    const designStatus = refinement.designStatus;
    const isDevelopment = designPhase[designStatus] === "development";
    const canComplete =
        canEditSlot &&
        designStatus === "refinement" &&
        isRefinementDone(inquiries, refinement.refinementChecks, refinement.version);

    const isSaving = isChecking || isWithdrawing || isDeleting || isReopening || isCompleting;

    const onMarkComplete = async () => {
        try {
            await updateSlot({ project, number, statuses: { design: { status: "complete" } } }).unwrap();
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to complete design" });
        }
    };

    const onConfirmDelete = async () => {
        if (!deleting) {
            return;
        }
        try {
            await deleteInquiry({ project, number, inquiry: deleting.inquiry }).unwrap();
            setDeleting(undefined);
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to delete inquiry" });
        }
    };

    const onConfirmReopen = async () => {
        if (!reopening) {
            return;
        }
        try {
            await reopenInquiry({ project, number, inquiry: reopening.inquiry }).unwrap();
            setReopening(undefined);
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to reopen inquiry" });
        }
    };

    const actions: ProcessAction[] =
        canRaise && inquiries.length > 0
            ? [
                  {
                      key: "raise",
                      label: "Raise inquiry",
                      icon: faPlus,
                      color: "primary",
                      // It has a home beside the Inquiries heading from `sm` up, which is where that copy
                      // stops drawing - one button in one place at every width, just not the same place
                      isMobileOnly: true,
                      isDisabled: isSaving,
                      onPress: () => setIsRaising(true)
                  }
              ]
            : [];

    const renderInquiry = (inquiry: IRefinementInquiry) => (
        <InquiryCard
            key={inquiry.inquiry}
            project={project}
            number={number}
            inquiry={inquiry}
            version={refinement.version}
            canEdit={canEditOthers || (canRaise && inquiry.createdBy === user?.discordId)}
            canDelete={canDeleteOthers || (canRaise && inquiry.createdBy === user?.discordId)}
            canResolve={canResolve}
            canStartDiscussion={canRaise}
            isSaving={isSaving}
            isHighlighted={inquiry.inquiry === highlightInquiry}
            onEdit={() => setEditing(inquiry)}
            onDelete={() => setDeleting(inquiry)}
            onResolve={() => setResolving(inquiry)}
            onReopen={() => setReopening(inquiry)}
        />
    );

    return (
        <div className="flex flex-col items-stretch gap-4 p-1 sm:p-2">
            <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 min-w-0">
                    <Button
                        size="sm"
                        variant="light"
                        className="shrink-0 px-1 -ml-1 text-foreground/50"
                        startContent={<FontAwesomeIcon icon={onBack ? faArrowLeft : faUpRightFromSquare} />}
                        onPress={() => (onBack ? onBack() : navigate(`/project/${project}?tab=refinements`))}
                    >
                        All Refinements
                    </Button>
                    <div className="h-4 w-px shrink-0 bg-content3" />
                    <span className="text-xs text-foreground/40 tabular-nums">Card {number}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h2 className="min-w-0 grow basis-auto font-cinzel text-xl sm:text-2xl tracking-wide">
                        {card?.name ?? `Slot ${number}`}
                    </h2>
                    <RefinementCheckControl
                        checks={refinement.refinementChecks}
                        inquiries={inquiries}
                        version={refinement.version}
                        canSubmit={canCheck}
                        isSaving={isChecking || isWithdrawing || isFetching}
                        className="shrink-0"
                        onCheck={() => submitCheck({ project, number })}
                        onWithdraw={() => withdrawCheck({ project, number })}
                    />
                </div>
            </div>
            {showTrack && (
                <StatusStepper
                    steps={trackSteps}
                    currentIndex={designLane.statuses.indexOf(designStatus)}
                    color={designLane.color}
                    size="md"
                    className="w-full"
                />
            )}

            <div className="flex flex-col-reverse gap-4 sm:flex-row">
                <div className="flex min-w-0 flex-1 flex-col gap-4">
                    {isDevelopment && (
                        <StatusNotice
                            icon={faTriangleExclamation}
                            color="warning"
                            label="Design is not locked in yet"
                            detail="Refinement usually starts once a card reaches the Refinement step. Anything raised now still stands, but the card may change underneath it."
                        />
                    )}

                    <RefinementChecklist requirements={requirements} />

                    <AnimatePresence initial={false}>
                        {canComplete && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={NOTICE_TRANSITION}
                                className="overflow-hidden"
                            >
                                <StatusNotice
                                    icon={faCircleCheck}
                                    color="success"
                                    label="Refinement is finished"
                                    detail="Nothing is left outstanding on this card."
                                >
                                    <Button
                                        size="sm"
                                        color="success"
                                        isLoading={isCompleting}
                                        onPress={onMarkComplete}
                                        className="shrink-0"
                                    >
                                        Mark complete
                                    </Button>
                                </StatusNotice>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="flex flex-col gap-2">
                        <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
                            <SectionTitle className="md:flex-1">Inquiries</SectionTitle>
                            <div className="flex items-center justify-end gap-2">
                                <StateChip
                                    label="Open"
                                    count={open.length}
                                    color="primary"
                                    icon={faCircleDot}
                                    isActive={showOpen}
                                    onPress={() => setShowOpen(!showOpen)}
                                />
                                <StateChip
                                    label="Resolved"
                                    count={resolved.length}
                                    color="success"
                                    icon={faCircleCheck}
                                    isActive={showResolved}
                                    onPress={() => setShowResolved(!showResolved)}
                                />
                                {canRaise && inquiries.length > 0 && (
                                    <Button
                                        size="sm"
                                        color="primary"
                                        className="hidden sm:flex"
                                        isDisabled={isSaving}
                                        startContent={<FontAwesomeIcon icon={faPlus} />}
                                        onPress={() => setIsRaising(true)}
                                    >
                                        Raise inquiry
                                    </Button>
                                )}
                            </div>
                        </div>

                        {inquiries.length === 0 ? (
                            <div className="p-4 bg-content1 border border-content3 flex-shrink-0">
                                <div className="text-2xl font-cinzel">
                                    <FontAwesomeIcon icon={faFeatherPointed} /> Not a word has been questioned...
                                </div>
                                {canRaise && (
                                    <>
                                        <div className="text-sm font-sans">
                                            No inquiry stands against this card — raise the first if anything on it
                                            reads amiss.
                                        </div>
                                        <div className="pt-2 flex justify-center w-full">
                                            <Button
                                                color="primary"
                                                isDisabled={isSaving}
                                                onPress={() => setIsRaising(true)}
                                            >
                                                Put the first question!
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <>
                                <FilterRow>
                                    {inquirySeverities.map((entry) => {
                                        const meta = inquirySeverityMeta[entry];
                                        return (
                                            <FilterChip
                                                key={entry}
                                                label={meta.label}
                                                count={severityCounts[entry]}
                                                isActive={severities.includes(entry)}
                                                startContent={
                                                    <FontAwesomeIcon icon={meta.icon} className="ml-1 mr-0.5" />
                                                }
                                                onPress={() =>
                                                    setSeverities(
                                                        severities.includes(entry)
                                                            ? severities.filter((value) => value !== entry)
                                                            : [...severities, entry]
                                                    )
                                                }
                                            />
                                        );
                                    })}
                                </FilterRow>

                                {visible.length > 0 ? (
                                    <div className="flex flex-col gap-2">{visible.map(renderInquiry)}</div>
                                ) : (
                                    <div className="rounded-md border border-dashed border-content3 p-6 text-center text-sm text-foreground/50">
                                        No inquiries match these filters.
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {canReadFaq && (
                        <FaqSection project={project} number={number} faq={refinement.faq} canEdit={canEditFaq} />
                    )}

                    <ProcessActions actions={actions} />
                </div>

                {card && (
                    <div className="mx-auto flex w-56 shrink-0 flex-col sm:mx-0 sm:self-start sm:sticky sm:top-20 lg:w-64">
                        <RefinementCardStack project={project} number={number} latest={card} draft={draft} />
                    </div>
                )}
            </div>

            <InquiryModal
                isOpen={isRaising || !!editing}
                project={project}
                number={number}
                inquiry={editing}
                card={measuredCard}
                version={refinement.version}
                onClose={() => {
                    setIsRaising(false);
                    setEditing(undefined);
                }}
            />
            <ResolveInquiryModal
                isOpen={!!resolving}
                project={project}
                number={number}
                inquiry={resolving}
                onClose={() => setResolving(undefined)}
            />
            <ConfirmModal
                isOpen={!!deleting}
                isLoading={isDeleting}
                title="Are you sure?"
                content={
                    <div className="flex flex-col gap-2 text-sm">
                        <span>
                            Inquiry <span className="font-mono tabular-nums">#{deleting?.inquiry}</span>,{" "}
                            <span className="font-semibold">{deleting?.summary}</span>, will be removed from this card
                            for good. This cannot be undone.
                        </span>
                        <span className="text-foreground/60">
                            Deleting is for one raised by mistake. If it was genuinely considered and dropped, resolve
                            it instead so the record of that decision survives.
                        </span>
                    </div>
                }
                confirmContent="Delete inquiry"
                cancelContent="Keep it"
                onClose={() => setDeleting(undefined)}
                onConfirm={onConfirmDelete}
            />
            <ConfirmModal
                isOpen={!!reopening}
                isLoading={isReopening}
                title="Are you sure?"
                content={
                    <div className="flex flex-col gap-2 text-sm">
                        <span>
                            Inquiry <span className="font-mono tabular-nums">#{reopening?.inquiry}</span>,{" "}
                            <span className="font-semibold">{reopening?.summary}</span>, will go back to being open.
                        </span>
                        <span className="text-foreground/60">
                            The reason it was resolved with is cleared, and whoever resolves it next will have to give
                            their own.
                        </span>
                    </div>
                }
                confirmContent="Reopen inquiry"
                cancelContent="Leave it resolved"
                onClose={() => setReopening(undefined)}
                onConfirm={onConfirmReopen}
            />
        </div>
    );
}

/**
 * The card being refined, as the card page draws it - the same stack, tabs and draft actions, cut down to
 * the two versions refinement is about. Everything before the latest is history an inquiry cannot be raised against.
 */
function RefinementCardStack({ project, number, latest, draft }: RefinementCardStackProps) {
    // Newest last, so the draft sits on top of the pile and the card it supersedes beneath it - a stack
    // reads as a pile of paper, and the sheet most recently put down is the one on top
    const cards = useMemo(() => (draft ? [latest, draft] : [latest]), [draft, latest]);
    const topIndex = cards.length - 1;
    const [selectedIndex, setSelectedIndex] = useState(topIndex);
    const isReleaseBound = useIsReleaseBound(project, number);

    // A draft appearing takes the selection: it is the version the next inquiry answers for
    useEffect(() => {
        setSelectedIndex(topIndex);
    }, [draft?.version, topIndex]);

    return (
        <div className="flex flex-col min-w-0">
            <div className="flex items-center">
                <DraftActions project={project} number={number} showDivider={cards.length > 1} className="shrink-0" />
                {cards.length > 1 && (
                    <Tabs
                        className="flex-1 min-w-0 flex-row-reverse justify-end select-none"
                        classNames={{ base: "w-full", tabList: "px-0", tab: "px-2" }}
                        selectedKey={String(selectedIndex)}
                        onSelectionChange={(index) => setSelectedIndex(Number(index))}
                        aria-label="Card Versions"
                        variant="underlined"
                        color="primary"
                        destroyInactiveTabPanel={false}
                    >
                        {cards.map((entry, index) => (
                            <Tab
                                key={index}
                                title={
                                    <span className="text-sm font-sans">
                                        {versionLabel(entry, isReleaseBound && index === topIndex)}
                                    </span>
                                }
                            />
                        ))}
                    </Tabs>
                )}
            </div>
            <div className="flex justify-center py-4">
                <CardStack cards={cards} selectedIndex={selectedIndex} tilt={-1} className="w-full max-w-full">
                    {(entry, index) => <StackedVersion card={entry} isSelected={index === selectedIndex} />}
                </CardStack>
            </div>
        </div>
    );
}

type RefinementCardStackProps = {
    project: number;
    number: number;
    latest: IPlaytestCard;
    draft?: IPlaytestCard;
};

function RefinementTabSkeleton({ showTrack }: { showTrack?: boolean }) {
    return (
        <div className="flex flex-col gap-4 p-1 sm:p-2">
            {showTrack && <Skeleton className="h-12 rounded-lg" />}
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-32 rounded-lg" />
        </div>
    );
}

type RefinementTabProps = {
    project: number;
    number: number;
    /** An inquiry to draw attention to on arrival, named by whoever sent you here */
    highlightInquiry?: number;
    /** For the project's editor, which has no card progress above it to read the design track from */
    showTrack?: boolean;
    /** Where "All Refinements" leads when the list is already on screen; otherwise it navigates to it */
    onBack?: () => void;
};
