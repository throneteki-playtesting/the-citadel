import { ReactNode, useEffect, useState } from "react";
import classNames from "classnames";
import { addToast, Button, Chip, ModalBody, ModalContent, ModalFooter, ModalHeader, Tooltip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faBoxArchive, faCheck, faLink, faLock, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { CardPreview } from "@agot/card-preview";
import { cardMatchLabel, ICardSuggestion, ISuggestionCardMatch } from "common/models/cards";
import { canDeleteSuggestion, pluralize, renderPlaytestingCard } from "common/utils";
import { useMarkSuggestionDevelopedAsMutation } from "../../api";
import { showApiErrorToast } from "../../api/errors";
import Modal from "../../components/modal";
import SlidingPages from "../../components/slidingPages";
import SuggestionCardPreview from "../../components/suggestionCardPreview";
import { UserRow } from "../../components/userAvatar";
import { useScopedUser } from "../../hooks/useScopedUser";
import PointList, { Point } from "./pointList";

const PICK_PAGE = 1;
const CONFIRM_PAGE = 2;

type PickRole = "link" | "delete";

function linkPoints(match: ISuggestionCardMatch, linked: string): Point[] {
    const { code } = match.project;
    return match.project.isDraft
        ? [
              {
                  icon: faLink,
                  text: `${cardMatchLabel(match)} is recorded as coming from ${linked}, and can't be linked to another.`
              },
              { icon: faBoxArchive, text: `Once ${code} begins, ${linked} is archived as used there.` },
              { icon: faLock, text: "From then on it can't be edited or completed." }
          ]
        : [
              {
                  icon: faBoxArchive,
                  text: `${linked[0].toUpperCase()}${linked.slice(1)} is archived as used in ${code}.`
              },
              { icon: faLock, text: "It can no longer be edited or completed." },
              {
                  icon: faLink,
                  text: `${cardMatchLabel(match)} is recorded as coming from it, and can't be linked to another suggestion.`
              }
          ];
}

/** The card the suggestions may have become - its synced image where there is one, otherwise drawn from its data */
function MatchedCard({ match, className }: { match: ISuggestionCardMatch; className?: string }) {
    const card = match.firstVersion;
    const isPlot = card.type === "plot";
    const imageUrl = card._metadata?.imageUrl;
    return (
        <div className={classNames(isPlot ? "aspect-[333/240]" : "aspect-[240/333]", className)}>
            {imageUrl ? (
                <img src={imageUrl} alt={card.name} className="size-full object-contain rounded-md" />
            ) : (
                <CardPreview
                    card={renderPlaytestingCard(card)}
                    orientation={isPlot ? "horizontal" : "vertical"}
                    rounded
                />
            )}
        </div>
    );
}

/** A card with what it is beneath it */
function Labelled({ label, className, children }: { label: ReactNode; className?: string; children: ReactNode }) {
    return (
        <div className={classNames("flex flex-col items-center gap-1.5 min-w-0", className)}>
            {children}
            <span className="w-full text-xs text-foreground/60 text-center">{label}</span>
        </div>
    );
}

/** Darkened, with a bin across it - unmistakably the card that will be gone */
function DeleteMark({ size = "lg" }: { size?: "sm" | "lg" }) {
    return (
        <span className="absolute inset-0 grid place-items-center rounded-md bg-black/55 pointer-events-none">
            <FontAwesomeIcon
                icon={faTrashCan}
                className={classNames("text-danger drop-shadow-lg", size === "lg" ? "text-5xl" : "text-2xl")}
            />
        </span>
    );
}

/** One of the suggestions on offer, as a toggle: the first picked is linked, any after it deleted */
function OptionTile({
    suggestion,
    isCurrent,
    role,
    isBlocked,
    onToggle
}: {
    suggestion: ICardSuggestion;
    isCurrent: boolean;
    role?: PickRole;
    /** A link is already chosen and this one can't be deleted, so there is nothing picking it could do */
    isBlocked: boolean;
    onToggle: () => void;
}) {
    const tile = (
        <button
            type="button"
            aria-pressed={!!role}
            aria-label={`${suggestion.card.name}${role ? ` - to ${role}` : ""}`}
            aria-disabled={isBlocked}
            onClick={() => !isBlocked && onToggle()}
            className={classNames(
                "relative block w-full select-none text-left rounded-md outline-none transition",
                "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isBlocked ? "cursor-not-allowed opacity-40" : "cursor-pointer"
            )}
        >
            <SuggestionCardPreview
                suggestion={suggestion}
                orientation={suggestion.card.type === "plot" ? "horizontal" : "vertical"}
                rounded
                className={classNames("transition", {
                    "ring-2 ring-success": role === "link",
                    "ring-2 ring-danger": role === "delete"
                })}
            />
            {role === "delete" && <DeleteMark />}
            {role && (
                <Chip
                    size="sm"
                    variant="solid"
                    color={role === "link" ? "success" : "danger"}
                    className="absolute left-1 top-1"
                    startContent={<FontAwesomeIcon icon={role === "link" ? faLink : faTrashCan} className="ml-1" />}
                >
                    {role === "link" ? "Link" : "Delete"}
                </Chip>
            )}
            {role === "link" && (
                <span className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-success text-xs text-success-foreground">
                    <FontAwesomeIcon icon={faCheck} />
                </span>
            )}
        </button>
    );
    return (
        <Labelled
            label={
                isCurrent ? (
                    <span className="font-semibold text-foreground/80">This suggestion</span>
                ) : (
                    <UserRow
                        discordId={suggestion.createdBy}
                        className="justify-center"
                        textClassName="text-xs"
                        avatarClassName="!size-4"
                    />
                )
            }
        >
            {isBlocked ? (
                <Tooltip content="You can't delete this suggestion, so it can only be left as it is">{tile}</Tooltip>
            ) : (
                tile
            )}
        </Labelled>
    );
}

// Links a legacy suggestion to a card it was developed as. With other suggestions matching the same card, it opens
// on a choice of which of them the card came from - any picked after that one are deleted as duplicates of it. With
// nothing else to choose from, it opens straight onto the confirmation, as though that choice had already been made.
export default function LinkSuggestionModal({
    isOpen,
    suggestion,
    match,
    onClose,
    onCurrentDeleted
}: LinkSuggestionModalProps) {
    const { user } = useScopedUser();
    const [markDevelopedAs, { isLoading: isLinking }] = useMarkSuggestionDevelopedAsMutation();
    const options = match ? [suggestion, ...match.others] : [suggestion];
    const hasChoice = options.length > 1;
    const [picks, setPicks] = useState<string[]>([]);
    const [page, setPage] = useState(PICK_PAGE);

    // Every opening starts afresh - with nothing to choose, already settled on the one there is
    useEffect(() => {
        if (isOpen) {
            setPicks(hasChoice ? [] : [suggestion.id!]);
            setPage(hasChoice ? PICK_PAGE : CONFIRM_PAGE);
        }
    }, [isOpen, hasChoice, suggestion.id]);

    const byId = new Map(options.map((option) => [option.id!, option]));
    const linked = picks.length > 0 ? byId.get(picks[0]) : undefined;
    const deleting = picks.slice(1).flatMap((id) => byId.get(id) ?? []);
    const roleOf = (id: string): PickRole | undefined =>
        picks[0] === id ? "link" : picks.includes(id) ? "delete" : undefined;
    const canDelete = (option: ICardSuggestion) => canDeleteSuggestion(user, option);

    // Unpicking the link hands it to the earliest pick after it, which is simply the next in line
    const toggle = (option: ICardSuggestion) =>
        setPicks((current) =>
            current.includes(option.id!)
                ? current.filter((id) => id !== option.id)
                : current.length === 0 || canDelete(option)
                  ? [...current, option.id!]
                  : current
        );

    const onConfirm = async () => {
        if (!match || !linked) {
            return;
        }
        try {
            const result = await markDevelopedAs({
                id: linked.id!,
                project: match.project.number,
                number: match.number,
                version: match.version,
                discard: deleting.map((option) => option.id!)
            }).unwrap();
            addToast({
                title: `Linked to ${cardMatchLabel(match)}`,
                color: "success",
                description:
                    result.deleted.length > 0
                        ? `${result.deleted.length} other ${pluralize(result.deleted.length, "suggestion")} deleted`
                        : undefined
            });
            if (result.deleted.includes(suggestion.id!)) {
                onCurrentDeleted();
            } else {
                onClose();
            }
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Link Suggestion" });
        }
    };

    const nameOf = (option: ICardSuggestion) =>
        option.id === suggestion.id ? "this suggestion" : "the suggestion picked";

    const pickPage = match && (
        <div key="pick" className="flex flex-col gap-4">
            <p className="text-sm text-foreground/70">
                These suggestions all match {cardMatchLabel(match)}. Pick the one it was developed from - it is linked
                to the card. Anything you pick after it is <span className="text-danger font-semibold">deleted</span> as
                a duplicate, and anything left unpicked stays as it is.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
                <Labelled
                    className="shrink-0 w-28 sm:w-40 sm:sticky sm:top-0"
                    label={`${cardMatchLabel(match)} - ${match.firstVersion.name}`}
                >
                    <MatchedCard match={match} className="w-full" />
                </Labelled>
                <div className="flex-1 w-full grid grid-cols-2 sm:grid-cols-3 gap-3 p-1">
                    {options.map((option) => {
                        const role = roleOf(option.id!);
                        return (
                            <OptionTile
                                key={option.id}
                                suggestion={option}
                                isCurrent={option.id === suggestion.id}
                                role={role}
                                isBlocked={!role && picks.length > 0 && !canDelete(option)}
                                onToggle={() => toggle(option)}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );

    const confirmPage = match && linked && (
        <div key="confirm" className="flex flex-col gap-4">
            <div className="flex items-center justify-center gap-3">
                <Labelled
                    className={linked.card.type === "plot" ? "w-40 sm:w-48" : "w-28 sm:w-36"}
                    label={linked.id === suggestion.id ? "This suggestion" : linked.card.name}
                >
                    <SuggestionCardPreview
                        suggestion={linked}
                        orientation={linked.card.type === "plot" ? "horizontal" : "vertical"}
                        rounded
                    />
                </Labelled>
                <FontAwesomeIcon icon={faArrowRight} className="shrink-0 text-xl text-primary mb-5" />
                <Labelled
                    className={match.firstVersion.type === "plot" ? "w-40 sm:w-48" : "w-28 sm:w-36"}
                    label={`${cardMatchLabel(match)} - ${match.firstVersion.name}`}
                >
                    <MatchedCard match={match} className="w-full" />
                </Labelled>
            </div>
            <PointList points={linkPoints(match, nameOf(linked))} />
            {deleting.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-dashed border-danger/40 pt-3">
                    <span className="font-cinzel uppercase tracking-widest text-sm text-danger">Will be deleted</span>
                    <div className="flex flex-wrap gap-2">
                        {deleting.map((option) => (
                            <Labelled
                                key={option.id}
                                className="w-16 sm:w-20"
                                label={option.id === suggestion.id ? "This suggestion" : option.card.name}
                            >
                                <div className="relative w-full">
                                    <SuggestionCardPreview
                                        suggestion={option}
                                        orientation={option.card.type === "plot" ? "horizontal" : "vertical"}
                                        rounded
                                    />
                                    <DeleteMark size="sm" />
                                </div>
                            </Labelled>
                        ))}
                    </div>
                    <PointList
                        points={[
                            {
                                icon: faTrashCan,
                                text: `${deleting.length === 1 ? "It is" : `All ${deleting.length} are`} removed for good, and can't be brought back.`
                            }
                        ]}
                    />
                </div>
            )}
        </div>
    );

    const pickSummary = `Link ${linked ? 1 : 0}${deleting.length > 0 ? ` · Delete ${deleting.length}` : ""}`;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            isDismissable={!isLinking}
            hideCloseButton={isLinking}
            size={hasChoice ? "4xl" : "lg"}
        >
            <ModalContent>
                <ModalHeader className="font-cinzel text-medium lg:text-large">
                    {match ? `Link to ${cardMatchLabel(match)}?` : "Link Suggestion"}
                </ModalHeader>
                <ModalBody>
                    {hasChoice ? (
                        <SlidingPages currentPage={page}>
                            {[pickPage, confirmPage ?? <div key="confirm" />]}
                        </SlidingPages>
                    ) : (
                        confirmPage
                    )}
                </ModalBody>
                <ModalFooter className="items-center">
                    {page === PICK_PAGE ? (
                        <>
                            <span className="mr-auto text-xs text-foreground/60">{pickSummary}</span>
                            <Button onPress={onClose}>Cancel</Button>
                            <Button color="primary" isDisabled={!linked} onPress={() => setPage(CONFIRM_PAGE)}>
                                Next
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button isDisabled={isLinking} onPress={hasChoice ? () => setPage(PICK_PAGE) : onClose}>
                                {hasChoice ? "Back" : "Cancel"}
                            </Button>
                            <Button
                                color={deleting.length > 0 ? "danger" : "primary"}
                                isLoading={isLinking}
                                isDisabled={!linked}
                                onPress={onConfirm}
                            >
                                {deleting.length > 0
                                    ? `Link & Delete ${deleting.length}`
                                    : match
                                      ? `Link to ${cardMatchLabel(match)}`
                                      : "Link"}
                            </Button>
                        </>
                    )}
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

type LinkSuggestionModalProps = {
    isOpen: boolean;
    /** The suggestion whose page this was opened from */
    suggestion: ICardSuggestion;
    match?: ISuggestionCardMatch;
    onClose: () => void;
    /** Linking deleted the suggestion this was opened from, which leaves its page with nothing to show */
    onCurrentDeleted: () => void;
};
