import { HTMLAttributes, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
    addToast,
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Switch,
    Tab,
    Tabs
} from "@heroui/react";
import { FormValidationContext } from "@react-stately/form";
import { isEmpty } from "lodash-es";
import { ICard, ICardSuggestion, IPlaytestCard } from "common/models/cards";
import { PlaytestingCard } from "common/models/schemas";
import { slotConditionIssues } from "common/models/slotConditions";
import { ISlot } from "common/models/slots";
import { DeepPartial } from "common/types";
import { pluralize, suggestionToPlaytestCard } from "common/utils";
import { useAddSlotOptionsMutation, useGetPoolQuery, useGetSuggestionsQuery } from "../../../api";
import { showApiErrorToast } from "../../../api/errors";
import AnimatedHeight from "../../../components/animatedHeight";
import CardEditor from "../../../components/cardEditor";
import EditorCardPreview from "../../../components/cardEditor/editorCardPreview";
import { EMPTY_SUGGESTION_FILTER, SuggestionFilterValue } from "../../../components/data/suggestionFilter";
import SlidingPages from "../../../components/slidingPages";
import SlotOptionsSummary from "../../../components/slots/slotOptionsSummary";
import ThronesIcon from "../../../components/thronesIcon";
import { EDITOR_CARD_WIDTH, PLOT_RATIO, POOL_READ_LIMIT } from "../../../constants";
import { schemaErrors } from "../../../hooks/useFormValidation";
import { useReducedMotion } from "../../../hooks/useReducedMotion";
import { useStableCallback } from "../../../hooks/useStableCallback";
import SuggestionBrowser from "../../suggestions/suggestionBrowser";
import { SortOption } from "../../suggestions/suggestionSortOptions";
import useSuggestionServerFilter from "../../suggestions/suggestionServerFilter";
import { DraftCardBadges } from "./draftCardContent";
import { isUprightPlot, renderDraftCard } from "./draftSlots";
import { IncomingCard } from "./incomingCards";
import PickableSuggestion from "./pickableSuggestion";
import ReviewPicks from "./reviewPicks";
import ScaledBadges from "./scaledBadges";
import TransitCard, { SLIDING_PAGE_ATTRIBUTE, TransitCardProps } from "./transitCard";

const BROWSE_PAGE = 1;
const REVIEW_PAGE = 2;
const NO_ERRORS = {};
const SLIDING_PAGE_PROPS = () => ({ [SLIDING_PAGE_ATTRIBUTE]: "" }) as HTMLAttributes<HTMLDivElement>;
// What the modal's own header, controls and footer leave of the screen, so a region of cards scrolls rather than the modal
const BROWSE_SCROLL_CLASS = "-mx-2 max-h-[calc(100vh-25rem)] px-2 py-0.5";
const REVIEW_SCROLL_CLASS = "-mx-2 max-h-[calc(100vh-28rem)] px-2 py-1";
const EDIT_SCROLL_CLASS = "max-h-[calc(100vh-22rem)] overflow-y-auto pt-2";

type Source = "pooled" | "approved" | "all";
/** A suggestion chosen for the slot, and the card it will go in as - which may be edited before it does */
type PickedSuggestion = { suggestion: ICardSuggestion; card: DeepPartial<IPlaytestCard> };
type CardErrors = Record<string, Record<string, string>>;
type Transit = Omit<TransitCardProps, "onDone">;
type TransitEnds = Pick<Transit, "fromControl" | "toControl" | "source" | "getTarget">;

const idOf = (pick: PickedSuggestion) => pick.suggestion.id ?? "";

// Picks any number of suggestions for a draft project's slot, put in order and reviewed before they all go in together
export default function SelectSuggestionModal({ slot, ...props }: SelectSuggestionModalProps) {
    return slot ? <SuggestionPicker slot={slot} {...props} /> : null;
}

function SuggestionPicker({
    isOpen,
    project,
    slot,
    hasNonPlot,
    cardWidth,
    used,
    onClose,
    onSave
}: SuggestionPickerProps) {
    const [addOptions, { isLoading: isAdding }] = useAddSlotOptionsMutation();
    const prefersReducedMotion = useReducedMotion();
    const flightNodes = useRef(new Map<string, HTMLElement>());
    const previewRef = useRef<HTMLDivElement>(null);
    const [page, setPage] = useState(BROWSE_PAGE);
    const [chosenSource, setChosenSource] = useState<Source>();
    const [fitsOnly, setFitsOnly] = useState(true);
    const [filter, setFilter] = useState<SuggestionFilterValue>(EMPTY_SUGGESTION_FILTER);
    const [search, setSearch] = useState("");
    const [sortBy, setSortBy] = useState<SortOption>("likes");
    const [picks, setPicks] = useState<PickedSuggestion[]>([]);
    const [editingId, setEditingId] = useState<string>();
    const [isDirect, setIsDirect] = useState(false);
    const [errors, setErrors] = useState<CardErrors>({});
    const [transit, setTransit] = useState<Transit>();

    // Reset as it opens, so the next slot starts on a fresh browse rather than the last one's picks - and the
    // last one's stay on show while it fades out
    useEffect(() => {
        if (isOpen) {
            setPage(BROWSE_PAGE);
            setChosenSource(undefined);
            setFitsOnly(true);
            setFilter(EMPTY_SUGGESTION_FILTER);
            setSearch("");
            setPicks([]);
            setEditingId(undefined);
            setIsDirect(false);
            setErrors({});
        }
    }, [isOpen]);

    // Greyed out once nothing approved is left to choose from, rather than offering a tab which is empty
    const approvedFilter = useSuggestionServerFilter(
        { ...EMPTY_SUGGESTION_FILTER, faction: slot.faction, approvedFilter: "only" },
        "",
        {}
    );
    const { data: approvedFit } = useGetSuggestionsQuery(
        {
            filter: approvedFilter,
            perPage: 1,
            ...(fitsOnly && { fitsSlot: `${project}:${slot.number}` })
        },
        { skip: !isOpen }
    );
    // The same for the pool - what is left in it that this slot could take, as the switch below has it set
    const { data: pool } = useGetPoolQuery({ project }, { skip: !isOpen });
    const poolFilter = useSuggestionServerFilter({ ...EMPTY_SUGGESTION_FILTER, faction: slot.faction }, "", {});
    const { data: pooledFit } = useGetSuggestionsQuery(
        {
            filter: poolFilter,
            pooledIn: project,
            perPage: POOL_READ_LIMIT,
            ...(fitsOnly && { fitsSlot: `${project}:${slot.number}` })
        },
        { skip: !isOpen || !pool?.length }
    );
    const hasApproved = !approvedFit || approvedFit.total > 0;
    const hasPooled = pooledFit
        ? pooledFit.items.some((suggestion) => !suggestion.id || !used.has(suggestion.id))
        : !!pool?.length;
    // The pool first once it holds anything, then the approved - each only while it has something to choose from
    const defaultSource: Source = hasPooled ? "pooled" : hasApproved ? "approved" : "all";
    const isChosenOpen = chosenSource === "pooled" ? hasPooled : chosenSource === "approved" ? hasApproved : true;
    const shownSource = chosenSource && isChosenOpen ? chosenSource : defaultSource;

    const hasConditions = !!slot.conditions?.length;
    const editing = picks.find((pick) => idOf(pick) === editingId);
    // A single pick has nothing to put in order, so its editor is the page after the browse
    const hasReview = picks.length > 1;
    const editPageNo = hasReview ? REVIEW_PAGE + 1 : REVIEW_PAGE;
    const slotHasNonPlot = hasNonPlot || picks.some((pick) => pick.suggestion.card.type !== "plot");

    // Typing in a card's editor changes the picks, but not which are picked - the grid of suggestions is left alone
    const pickedKey = picks.map(idOf).join("\n");
    const pickedIds = useMemo(() => new Set(pickedKey ? pickedKey.split("\n") : []), [pickedKey]);
    // The review lags what is typed, so a card being written doesn't redraw every other card on each keystroke
    const deferredPicks = useDeferredValue(picks);
    const reviewCards = useMemo(
        () => deferredPicks.map((pick) => ({ id: idOf(pick), card: pick.card as IPlaytestCard })),
        [deferredPicks]
    );
    const problems = useMemo(() => new Set(Object.keys(errors).filter((id) => !isEmpty(errors[id]))), [errors]);

    const toggle = useStableCallback((suggestion: ICardSuggestion) =>
        setPicks((current) =>
            current.some((pick) => idOf(pick) === suggestion.id)
                ? current.filter((pick) => idOf(pick) !== suggestion.id)
                : [...current, { suggestion, card: suggestionToPlaytestCard(suggestion, project, slot.number) }]
        )
    );
    const editPick = (id: string, isFromBrowse: boolean) => {
        setEditingId(id);
        setIsDirect(isFromBrowse);
        setPage(editPageNo);
    };
    const carry = (pick: PickedSuggestion, from: DOMRect, ends: TransitEnds, isFromEditor = false) => {
        const card = pick.card as IPlaytestCard;
        setTransit({
            card,
            rank: picks.indexOf(pick),
            isUpright: !isFromEditor && isUprightPlot(card, slotHasNonPlot),
            issues: slotConditionIssues(slot.conditions, card, isFromEditor),
            from,
            stackWidth: cardWidth,
            ...ends
        });
    };
    // The card travels from its place in the review to the editor's preview, and back
    const openEditor = useStableCallback((id: string) => {
        const pick = picks.find((candidate) => idOf(candidate) === id);
        const node = flightNodes.current.get(id);
        if (pick && node && !prefersReducedMotion) {
            carry(pick, node.getBoundingClientRect(), {
                fromControl: "button",
                toControl: "none",
                source: node,
                getTarget: () => previewRef.current
            });
        }
        editPick(id, false);
    });
    const returnToReview = () => {
        const preview = previewRef.current;
        if (editing && preview && editingId && !prefersReducedMotion) {
            carry(
                editing,
                preview.getBoundingClientRect(),
                {
                    fromControl: "none",
                    toControl: "button",
                    source: preview,
                    getTarget: () => flightNodes.current.get(editingId)
                },
                true
            );
        }
        setPage(REVIEW_PAGE);
    };
    const proceed = () => {
        if (picks.length === 1) {
            editPick(idOf(picks[0]), true);
        } else {
            setPage(REVIEW_PAGE);
        }
    };
    const reorder = useStableCallback((ids: string[]) =>
        setPicks((current) => ids.flatMap((id) => current.filter((pick) => idOf(pick) === id)))
    );
    const edit = useStableCallback((card: DeepPartial<ICard>) => {
        setPicks((current) =>
            current.map((pick) => (idOf(pick) === editingId ? { ...pick, card: { ...pick.card, ...card } } : pick))
        );
        setErrors((current) => (editingId && current[editingId] ? { ...current, [editingId]: NO_ERRORS } : current));
    });

    const submit = async () => {
        const found = Object.fromEntries(
            picks.map((pick) => [idOf(pick), schemaErrors(PlaytestingCard.Draft, pick.card)])
        );
        if (Object.values(found).some((cardErrors) => !isEmpty(cardErrors))) {
            setErrors(found);
            addToast({
                title: "Cards need attention",
                color: "danger",
                description: "One or more cards can't be added as they are"
            });
            return;
        }
        // Taken before anything changes, as these are where the cards will be flown from
        const rects = isDirect
            ? [previewRef.current?.getBoundingClientRect()]
            : picks.map((pick) => flightNodes.current.get(idOf(pick))?.getBoundingClientRect());
        try {
            const cards = picks.map((pick) => pick.card as IPlaytestCard);
            const created = await addOptions({ project, number: slot.number, cards }).unwrap();
            const isFlying = !prefersReducedMotion && rects.every((rect) => !!rect);
            if (isFlying) {
                // Their copies carry on from here, so the originals shouldn't linger as the modal fades
                flightNodes.current.forEach((node) => node.style.setProperty("visibility", "hidden"));
                previewRef.current?.style.setProperty("visibility", "hidden");
            }
            onSave(
                created,
                isFlying
                    ? created.map((card, rank) => ({
                          card,
                          rank,
                          from: rects[rank]!,
                          isUpright: isUprightPlot(card, slotHasNonPlot),
                          isFromUpright: !isDirect && isUprightPlot(card, slotHasNonPlot),
                          issues: slotConditionIssues(slot.conditions, card, isDirect),
                          fromControl: isDirect ? "none" : "button"
                      }))
                    : undefined
            );
            onClose();
        } catch (error) {
            showApiErrorToast(error, { title: "Failed to add suggestions" });
        }
    };

    const disabledSources = useMemo(
        () => [...(hasPooled ? [] : ["pooled"]), ...(hasApproved ? [] : ["approved"])],
        [hasPooled, hasApproved]
    );
    const queryExtras = useMemo(
        () => ({
            ...(fitsOnly && { fitsSlot: `${project}:${slot.number}` }),
            ...(shownSource === "pooled" && { pooledIn: project })
        }),
        [fitsOnly, project, slot.number, shownSource]
    );

    // Only as the picks, the filters or the slot change, so the pages beside the one on show stand still
    const browsePage = useMemo(
        () => (
            <SuggestionBrowser
                key="browse"
                className="pt-2"
                resetKey={slot.number}
                filter={filter}
                onFilterChange={setFilter}
                search={search}
                onSearchChange={setSearch}
                sortBy={sortBy}
                onSortChange={setSortBy}
                scope={{
                    faction: slot.faction,
                    ...(shownSource === "approved" && { approvedFilter: "only" })
                }}
                queryExtras={queryExtras}
                isFactionFixed
                scrollClassName={BROWSE_SCROLL_CLASS}
                emptyContent="No suggestions match this slot."
                leading={
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <Tabs
                            size="sm"
                            aria-label="Which suggestions to choose from"
                            selectedKey={shownSource}
                            disabledKeys={disabledSources}
                            onSelectionChange={(key) => setChosenSource(key as Source)}
                        >
                            <Tab key="pooled" title="Pooled" />
                            <Tab key="approved" title="Approved" />
                            <Tab key="all" title="All" />
                        </Tabs>
                        {hasConditions && (
                            <Switch size="sm" isSelected={fitsOnly} onValueChange={setFitsOnly}>
                                Matches slot conditions
                            </Switch>
                        )}
                    </div>
                }
            >
                {(suggestion) => (
                    <PickableSuggestion
                        key={suggestion.id}
                        suggestion={suggestion}
                        isPicked={pickedIds.has(suggestion.id ?? "")}
                        isDimmed={pickedIds.size > 0}
                        showLikes={sortBy === "likes"}
                        usedIn={suggestion.id ? used.get(suggestion.id) : undefined}
                        onToggle={toggle}
                    />
                )}
            </SuggestionBrowser>
        ),
        [
            slot,
            filter,
            search,
            sortBy,
            shownSource,
            fitsOnly,
            queryExtras,
            disabledSources,
            hasConditions,
            pickedIds,
            used,
            toggle
        ]
    );
    const reviewPage = (
        <div key="review" className="flex flex-col gap-2 pt-2">
            <p className="text-sm text-foreground/60">
                Drag to set the order of preference - you can rearrange it later. Edit any card here; the original
                suggestion stays unchanged.
            </p>
            <AnimatedHeight className={REVIEW_SCROLL_CLASS}>
                <ReviewPicks
                    cards={reviewCards}
                    slot={slot}
                    hasNonPlot={slotHasNonPlot}
                    cardWidth={slotHasNonPlot ? cardWidth : cardWidth * PLOT_RATIO}
                    problems={problems}
                    flightNodes={flightNodes.current}
                    onReorder={reorder}
                    onEdit={openEditor}
                />
            </AnimatedHeight>
        </div>
    );
    const editPage = (
        <div key="edit" className={EDIT_SCROLL_CLASS}>
            <div className="flex flex-col gap-2 md:flex-row">
                {editing && (
                    <>
                        <EditorCardPreview
                            ref={previewRef}
                            card={renderDraftCard(editing.card as IPlaytestCard, picks.indexOf(editing), slot.number)}
                            isPlot={editing.card.type === "plot"}
                            verticalWidth={EDITOR_CARD_WIDTH.modal}
                            className="self-center md:self-start"
                        >
                            <ScaledBadges referenceWidth={cardWidth}>
                                <DraftCardBadges
                                    issues={slotConditionIssues(slot.conditions, editing.card as IPlaytestCard, true)}
                                    actions={[]}
                                    isLive
                                />
                            </ScaledBadges>
                        </EditorCardPreview>
                        <FormValidationContext.Provider value={errors[editingId ?? ""] ?? NO_ERRORS}>
                            <CardEditor
                                key={editingId}
                                card={editing.card}
                                onUpdate={edit}
                                inputOptions={{ faction: "disabled" }}
                            />
                        </FormValidationContext.Provider>
                    </>
                )}
            </div>
        </div>
    );

    return (
        <>
            <Modal
                isOpen={isOpen}
                placement="top-center"
                size="5xl"
                scrollBehavior="inside"
                onOpenChange={(open) => !open && onClose()}
            >
                <ModalContent>
                    <ModalHeader className="flex items-center gap-2">
                        <ThronesIcon name={slot.faction} />
                        <span className="shrink-0">#{slot.number} Add Suggestions</span>
                        {hasConditions && (
                            <div className="ml-2 min-w-0 flex-1 text-xs font-normal text-foreground/60">
                                <SlotOptionsSummary options={slot} />
                            </div>
                        )}
                    </ModalHeader>
                    <ModalBody>
                        <SlidingPages currentPage={page} pageProps={SLIDING_PAGE_PROPS} className="-mt-2">
                            {[browsePage, ...(hasReview ? [reviewPage] : []), editPage]}
                        </SlidingPages>
                    </ModalBody>
                    <ModalFooter>
                        {page === BROWSE_PAGE && (
                            <>
                                <Button variant="flat" onPress={onClose}>
                                    Cancel
                                </Button>
                                <Button color="primary" isDisabled={picks.length === 0} onPress={proceed}>
                                    {hasReview
                                        ? `Review (${picks.length})`
                                        : picks.length === 1
                                          ? "Continue"
                                          : "Review"}
                                </Button>
                            </>
                        )}
                        {hasReview && page === REVIEW_PAGE && (
                            <>
                                <Button variant="flat" isDisabled={isAdding} onPress={() => setPage(BROWSE_PAGE)}>
                                    Back
                                </Button>
                                <Button color="primary" isLoading={isAdding} onPress={submit}>
                                    Add {picks.length} {pluralize(picks.length, "Suggestion")}
                                </Button>
                            </>
                        )}
                        {page === editPageNo && isDirect && (
                            <>
                                <Button variant="flat" isDisabled={isAdding} onPress={() => setPage(BROWSE_PAGE)}>
                                    Go Back
                                </Button>
                                <Button color="primary" isLoading={isAdding} onPress={submit}>
                                    Add Suggestion
                                </Button>
                            </>
                        )}
                        {page === editPageNo && !isDirect && (
                            <Button color="primary" onPress={returnToReview}>
                                Save & Back
                            </Button>
                        )}
                    </ModalFooter>
                </ModalContent>
            </Modal>
            {transit && <TransitCard {...transit} onDone={() => setTransit(undefined)} />}
        </>
    );
}

type SelectSuggestionModalProps = {
    isOpen: boolean;
    project: number;
    /** The slot being filled - absent until the first is chosen */
    slot?: ISlot;
    /** The slot already holds something other than a plot, so plots stand upright in it */
    hasNonPlot: boolean;
    /** The width a card is drawn at on the draft page, so a pick reads at the size it will be */
    cardWidth: number;
    /** Suggestions already an option somewhere in the project, by the slot holding them */
    used: Map<string, number>;
    onClose: () => void;
    /** The cards as created, in order of preference, and where each was drawn when it left - for flying them in */
    onSave: (cards: IPlaytestCard[], incoming?: IncomingCard[]) => void;
};

type SuggestionPickerProps = Omit<SelectSuggestionModalProps, "slot"> & { slot: ISlot };
