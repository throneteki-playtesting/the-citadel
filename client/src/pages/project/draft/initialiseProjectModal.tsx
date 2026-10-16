import { ReactNode, useEffect, useState } from "react";
import {
    Accordion,
    AccordionItem,
    addToast,
    Button,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Skeleton
} from "@heroui/react";
import Modal from "../../../components/modal";
import {
    faArrowUpRightFromSquare,
    faBoxArchive,
    faCirclePlay,
    faEye,
    faEyeSlash,
    faLock,
    faPenNib,
    faRotate
} from "@fortawesome/free-solid-svg-icons";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CardPreview } from "@agot/card-preview";
import classNames from "classnames";
import { IPlaytestCard } from "common/models/cards";
import { IProject } from "common/models/projects";
import { ISlot, previewedCard, previewOf, previewSyncedAt } from "common/models/slots";
import { renderPlaytestingCard } from "common/utils";
import { useGetSuggestionsQuery, useInitialiseProjectMutation } from "../../../api";
import { showApiErrorToast } from "../../../api/errors";
import SlidingPages from "../../../components/slidingPages";
import ThronesIcon from "../../../components/thronesIcon";
import { suggestionIcons } from "../../../constants";
import Timestamp from "../../../components/timestamp";
import { useHasOpened } from "../../../hooks/useHasOpened";
import { isPreviewOutdated } from "./revealState";

const OUTCOMES_PAGE = 1;
const SUMMARY_PAGE = 2;
// One column to each kind of fact, so every row's facts line up - icons alone where there is no room for words
const FACT_COLUMN_WIDTHS = ["sm:w-24", "sm:w-20"];

// Spells out what initialising does before it is done, since none of it can be taken back
export default function InitialiseProjectModal({
    isOpen,
    project,
    cards,
    slots,
    isReady,
    onClose
}: InitialiseProjectModalProps) {
    const [initialiseProject, { isLoading: isInitialising }] = useInitialiseProjectMutation();
    const [page, setPage] = useState(OUTCOMES_PAGE);

    useEffect(() => {
        if (!isOpen) {
            setPage(OUTCOMES_PAGE);
        }
    }, [isOpen]);

    const outcomes = [
        {
            icon: faCirclePlay,
            content: (
                <>
                    Make the project <b>Active</b> - its slots are sealed, and can no longer be added or removed
                </>
            )
        },
        {
            icon: faLock,
            content: (
                <>
                    Lock in every card as <b>version 1.0.0</b>, with every later change tracked through playtesting
                    updates
                </>
            )
        },
        cards.some((card) => card.suggestionId) && {
            icon: faBoxArchive,
            content: "Archive every suggestion used in this project, and close its Discord thread"
        },
        slots.some((slot) => previewOf(slot)) && {
            icon: faDiscord,
            content:
                "Close every preview thread in the card forum, keeping its discussion, and open a fresh initial thread in its place"
        },
        { icon: faRotate, content: "Start syncing every card - images, Discord threads and GitHub issues" }
    ].flatMap((outcome) => (outcome ? [outcome] : []));

    const onProceed = async () => {
        try {
            await initialiseProject(project).unwrap();
            onClose();
            addToast({
                title: "Successfully initialised",
                color: "success",
                description: `${project.name} has been initialised`
            });
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Initialise" });
        }
    };

    const outcomesPage = (
        <div key="outcomes" className="flex flex-col gap-3 font-sans text-small lg:text-medium">
            <span className="text-foreground/70">
                Initialising ends the draft, where everything could be freely reworked or reset. From here the project
                is in playtesting, and proceeding will:
            </span>
            <ul className="flex flex-col divide-y divide-content3">
                {outcomes.map(({ icon, content }) => (
                    <li key={icon.iconName} className="flex items-center gap-3 py-2">
                        <FontAwesomeIcon icon={icon} fixedWidth className="shrink-0 text-xl text-primary" />
                        <span>{content}</span>
                    </li>
                ))}
            </ul>
            <span className="text-xs text-foreground/50">
                This marks the official start of playtesting, and is a good time to announce it to the community.
            </span>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="2xl">
            <ModalContent>
                <ModalHeader className="font-cinzel text-medium lg:text-large">Send the Raven?</ModalHeader>
                <ModalBody>
                    <SlidingPages currentPage={page}>
                        {[
                            outcomesPage,
                            <CardsSummary key="summary" cards={cards} slots={slots} isShown={page === SUMMARY_PAGE} />
                        ]}
                    </SlidingPages>
                </ModalBody>
                <ModalFooter>
                    {page === OUTCOMES_PAGE ? (
                        <>
                            <Button onPress={onClose}>Turn Back</Button>
                            <Button color="primary" onPress={() => setPage(SUMMARY_PAGE)}>
                                Next
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button isDisabled={isInitialising} onPress={() => setPage(OUTCOMES_PAGE)}>
                                Back
                            </Button>
                            <Button
                                color="success"
                                isDisabled={!isReady}
                                onPress={onProceed}
                                isLoading={isInitialising}
                            >
                                Initialise
                            </Button>
                        </>
                    )}
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

type InitialiseProjectModalProps = {
    isOpen: boolean;
    project: IProject;
    cards: IPlaytestCard[];
    slots: ISlot[];
    /** Re-checked while open, since the checklist can fall back if a slot changes underneath it */
    isReady: boolean;
    onClose: () => void;
};

type Fact = { icon: IconDefinition; className?: string; short: string; detail: ReactNode };

// Each card going in as a row - its name given room, a pair of short facts, and the card itself on expanding
function CardsSummary({ cards, slots, isShown }: { cards: IPlaytestCard[]; slots: ISlot[]; isShown: boolean }) {
    // Not asked for until somebody gets here
    const hasBeenShown = useHasOpened(isShown);
    const suggestionIds = cards.flatMap((card) => (card.suggestionId ? [card.suggestionId] : []));
    const {
        data: suggestions,
        isLoading,
        isError
    } = useGetSuggestionsQuery(
        { filter: { id: { $in: suggestionIds } }, page: 1, perPage: suggestionIds.length || 1 },
        { skip: !hasBeenShown || suggestionIds.length === 0 }
    );
    const names = new Map(suggestions?.items.map((suggestion) => [suggestion.id, suggestion.card.name]));
    const sorted = [...cards].sort((a, b) => a.number - b.number);

    return (
        <div className="flex flex-col gap-2 font-sans text-small">
            <span className="text-foreground/70">
                A last look at each card going in as version 1.0.0 - expand a card to see it.
            </span>
            <Accordion variant="light" isCompact itemClasses={{ trigger: "cursor-pointer py-1.5", content: "pb-3" }}>
                {sorted.map((card) => {
                    const facts = [
                        originFact(
                            card,
                            names.get(card.suggestionId ?? ""),
                            isLoading ? "loading" : isError ? "failed" : "loaded"
                        ),
                        previewFact(
                            card,
                            slots.find((slot) => slot.number === card.number)
                        )
                    ];
                    return (
                        <AccordionItem
                            key={card.number}
                            textValue={card.name}
                            title={
                                <div className="flex items-center gap-3">
                                    <ThronesIcon name={card.faction} className="shrink-0" />
                                    <span className="w-9 shrink-0 text-xs tabular-nums text-foreground/50">
                                        #{card.number}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate font-semibold">{card.name}</span>
                                    {facts.map(({ icon, className, short }, column) => (
                                        <span
                                            key={icon.iconName}
                                            className={classNames(
                                                "flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-foreground/70",
                                                FACT_COLUMN_WIDTHS[column]
                                            )}
                                        >
                                            <FontAwesomeIcon icon={icon} fixedWidth className={className} />
                                            <span className="hidden sm:inline">{short}</span>
                                        </span>
                                    ))}
                                </div>
                            }
                        >
                            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                                <div className="w-48 shrink-0">
                                    <CardPreview
                                        className="select-none"
                                        orientation={card.type === "plot" ? "horizontal" : undefined}
                                        card={renderPlaytestingCard({ ...card, draft: false, version: "1.0.0" })}
                                    />
                                </div>
                                <ul className="flex flex-col gap-3 text-sm text-foreground/80">
                                    {facts.map(({ icon, className, detail }) => (
                                        <li key={icon.iconName} className="flex items-start gap-2.5">
                                            <FontAwesomeIcon
                                                icon={icon}
                                                fixedWidth
                                                className={classNames("mt-0.5 shrink-0 text-base", className)}
                                            />
                                            <span>{detail}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </AccordionItem>
                    );
                })}
            </Accordion>
        </div>
    );
}

function SuggestionLink({ id }: { id: string }) {
    return (
        <a href={`/suggestions/${id}`} target="_blank" rel="noreferrer" className="text-primary underline">
            View suggestion <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-xs" />
        </a>
    );
}

function originFact(card: IPlaytestCard, name: string | undefined, lookup: "loading" | "failed" | "loaded"): Fact {
    const id = card.suggestionId;
    if (!id) {
        return { icon: faPenNib, short: "New", detail: "A new design, not based on a suggestion." };
    }
    if (lookup === "loading") {
        return {
            icon: suggestionIcons.base,
            short: "Suggestion",
            detail: <Skeleton className="h-4 w-56 rounded-md" />
        };
    }
    if (!name) {
        return {
            icon: suggestionIcons.base,
            short: "Suggestion",
            detail:
                lookup === "failed" ? (
                    <>
                        From a suggestion, which couldn't be looked up. <SuggestionLink id={id} />
                    </>
                ) : (
                    <>
                        From a suggestion which isn't there to be found - it may have been deleted, or be hidden from
                        you. <SuggestionLink id={id} />
                    </>
                )
        };
    }
    const isRenamed = name.trim().toLowerCase() !== card.name.trim().toLowerCase();
    return {
        icon: suggestionIcons.base,
        short: "Suggestion",
        detail: (
            <>
                {isRenamed ? `Originally the suggestion "${name}", renamed since.` : "From an existing suggestion."} It
                will be archived once the project is initialised. <SuggestionLink id={id} />
            </>
        )
    };
}

function previewFact(card: IPlaytestCard, slot?: ISlot): Fact {
    const preview = slot && previewOf(slot);
    if (!preview) {
        return {
            icon: faEyeSlash,
            className: "text-danger",
            short: "Unseen",
            detail: "Nothing in this slot has been previewed to the design team."
        };
    }
    const posted = <Timestamp date={previewSyncedAt(preview)} variant="long" inline />;
    if (previewedCard([card], preview) !== card) {
        return {
            icon: faEye,
            className: "text-warning",
            short: "Swapped",
            detail: (
                <>
                    The slot was previewed as a different card, "{preview.name}", {posted}. This card was never shown to
                    the design team.
                </>
            )
        };
    }
    return isPreviewOutdated(card, preview)
        ? {
              icon: faEye,
              className: "text-warning",
              short: "Changed",
              detail: (
                  <>
                      Previewed {posted}, before this card's latest changes - what the design team saw is not quite what
                      goes in.
                  </>
              )
          }
        : {
              icon: faEye,
              className: "text-success",
              short: "Seen",
              detail: <>Previewed {posted}, and unchanged since.</>
          };
}
