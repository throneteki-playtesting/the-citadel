import { ReactNode, useEffect, useState } from "react";
import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";
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
import CardShape from "../../components/cardShape";
import SuggestionCardPreview from "../../components/suggestionCardPreview";
import ZoomableCard from "../../components/zoomableCard";
import { ZoomGuardContext } from "../../hooks/zoomGuard";
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

const aspectOf = (isPlot: boolean) => (isPlot ? "aspect-[333/240]" : "aspect-[240/333]");
const orientationOf = (isPlot: boolean) => (isPlot ? "horizontal" : "vertical");

/** The card the suggestions may have become - its synced image where there is one, otherwise drawn from its data */
function MatchedCard({ match, className }: { match: ISuggestionCardMatch; className?: string }) {
    const card = match.firstVersion;
    const isPlot = card.type === "plot";
    const imageUrl = card._metadata?.imageUrl;
    const orientation = orientationOf(isPlot);
    return (
        <ZoomableCard
            alt={`${cardMatchLabel(match)} - ${card.name}`}
            isPlot={isPlot}
            imageUrl={imageUrl}
            className={classNames(aspectOf(isPlot), className)}
            focus={<CardPreview card={renderPlaytestingCard(card)} orientation={orientation} rounded />}
        >
            {imageUrl ? (
                <img src={imageUrl} alt={card.name} className="size-full object-contain rounded-md" />
            ) : (
                <CardPreview card={renderPlaytestingCard(card)} orientation={orientation} rounded />
            )}
        </ZoomableCard>
    );
}

/** A suggestion's card, drawn from its data. Pressing it zooms in, unless `isZoomable` is off - then `overlay` is what
 *  answers a press. */
function SuggestionPiece({
    suggestion,
    overlay,
    className,
    isZoomable = true
}: {
    suggestion: ICardSuggestion;
    overlay?: ReactNode;
    className?: string;
    isZoomable?: boolean;
}) {
    const isPlot = suggestion.card.type === "plot";
    const orientation = orientationOf(isPlot);
    const card = <SuggestionCardPreview suggestion={suggestion} orientation={orientation} rounded />;
    if (!isZoomable) {
        return (
            <div className={classNames("relative", aspectOf(isPlot), className)}>
                {card}
                {overlay}
            </div>
        );
    }
    return (
        <ZoomableCard
            alt={suggestion.card.name}
            isPlot={isPlot}
            overlay={overlay}
            className={classNames(aspectOf(isPlot), className)}
            focus={card}
        >
            {card}
        </ZoomableCard>
    );
}

/** What a card is, on one line however long - so a row of them stays level */
function Caption({ label }: { label: ReactNode }) {
    return (
        <span className="flex h-5 w-full items-center justify-center overflow-hidden whitespace-nowrap text-xs text-foreground/60">
            {typeof label === "string" ? (
                <span className="truncate" title={label}>
                    {label}
                </span>
            ) : (
                label
            )}
        </span>
    );
}

/** Who made a suggestion, badged when it is the one this was opened from */
function Maker({ suggestion, isCurrent }: { suggestion: ICardSuggestion; isCurrent: boolean }) {
    return (
        <UserRow
            discordId={suggestion.createdBy}
            className="justify-center"
            textClassName="text-xs"
            avatarClassName="!size-4"
            trailing={
                isCurrent && (
                    <Chip size="sm" variant="flat" color="primary" className="h-4 shrink-0 px-0 text-[10px]">
                        This one
                    </Chip>
                )
            }
        />
    );
}

/** A card with what it is beneath it */
function Labelled({ label, className, children }: { label: ReactNode; className?: string; children: ReactNode }) {
    return (
        <div className={classNames("flex flex-col items-center gap-1.5 min-w-0", className)}>
            {children}
            <Caption label={label} />
        </div>
    );
}

/** Darkened, with a bin across it - unmistakably the card that will be gone */
function DeleteMark({ isPlot, size = "lg" }: { isPlot: boolean; size?: "sm" | "lg" }) {
    return (
        <CardShape isPlot={isPlot} className="bg-black/55">
            <FontAwesomeIcon
                icon={faTrashCan}
                className={classNames("text-danger drop-shadow-lg", size === "lg" ? "text-5xl" : "text-2xl")}
            />
        </CardShape>
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
    const isPlot = suggestion.card.type === "plot";
    const toggle = (
        <button
            type="button"
            aria-pressed={!!role}
            aria-label={`${suggestion.card.name}${role ? ` - to ${role}` : ""}`}
            aria-disabled={isBlocked}
            onClick={() => !isBlocked && onToggle()}
            className={classNames(
                "absolute inset-0 z-10 block size-full select-none rounded-md outline-none",
                "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isBlocked ? "cursor-not-allowed" : "cursor-pointer"
            )}
        />
    );
    return (
        <Labelled label={<Maker suggestion={suggestion} isCurrent={isCurrent} />}>
            <SuggestionPiece
                suggestion={suggestion}
                isZoomable={false}
                className={classNames("w-full transition", { "opacity-40": isBlocked })}
                overlay={
                    <>
                        {isBlocked ? (
                            <Tooltip content="You can't delete this suggestion, so it can only be left as it is">
                                {toggle}
                            </Tooltip>
                        ) : (
                            toggle
                        )}
                        <AnimatePresence>
                            {role && (
                                <motion.div
                                    key={role}
                                    className="pointer-events-none absolute inset-0"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.12 }}
                                >
                                    <CardShape
                                        isPlot={isPlot}
                                        className={classNames("ring-[3px] ring-inset", {
                                            "ring-success": role === "link",
                                            "ring-danger": role === "delete"
                                        })}
                                    />
                                    {role === "delete" && <DeleteMark isPlot={isPlot} />}
                                    <Chip
                                        size="sm"
                                        variant="solid"
                                        color={role === "link" ? "success" : "danger"}
                                        className="absolute left-1.5 top-1.5"
                                        startContent={
                                            <FontAwesomeIcon
                                                icon={role === "link" ? faLink : faTrashCan}
                                                className="ml-1"
                                            />
                                        }
                                    >
                                        {role === "link" ? "Link" : "Delete"}
                                    </Chip>
                                    {role === "link" && (
                                        <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-success text-xs text-success-foreground">
                                            <FontAwesomeIcon icon={faCheck} />
                                        </span>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>
                }
            />
        </Labelled>
    );
}

// Links a legacy suggestion to a card it was developed as. With others matching the same card it opens on a choice
// of which the card came from (later picks are deleted); with none, straight onto the confirmation.
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
    const [picks, setPicks] = useState<string[]>(() => (hasChoice ? [] : [suggestion.id!]));
    const [page, setPage] = useState(hasChoice ? PICK_PAGE : CONFIRM_PAGE);
    // A zoomed card's backdrop is outside the modal as far as it can tell, so it isn't dismissable while one is open
    const [isZoomed, setIsZoomed] = useState(false);

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
                <div className="flex shrink-0 flex-col items-center gap-2 rounded-xl border border-divider bg-content2/40 p-3 sm:sticky sm:top-0">
                    <span className="font-cinzel text-xs uppercase tracking-widest text-foreground/60">
                        Playtesting card
                    </span>
                    <Labelled className="w-40 sm:w-52" label={`${cardMatchLabel(match)} - ${match.firstVersion.name}`}>
                        <MatchedCard match={match} className="w-full" />
                    </Labelled>
                </div>
                <div className="flex-1 w-full grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 p-1">
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

    const isDeleting = deleting.length > 0;
    const cardWidth = (isPlot: boolean) => (isPlot ? "w-44 sm:w-60" : "w-32 sm:w-44");
    const confirmPage = match && linked && (
        <div key="confirm" className={classNames("flex flex-col gap-5", { "md:flex-row md:gap-7": isDeleting })}>
            <div
                className={classNames(
                    "mx-auto grid w-fit shrink-0 grid-cols-[auto_auto_auto] justify-center items-center gap-x-3 gap-y-1.5 sm:gap-x-4",
                    { "md:mx-0": isDeleting }
                )}
            >
                <div className={cardWidth(linked.card.type === "plot")}>
                    <SuggestionPiece suggestion={linked} className="w-full" />
                </div>
                <FontAwesomeIcon icon={faArrowRight} className="text-xl text-primary" />
                <div className={cardWidth(match.firstVersion.type === "plot")}>
                    <MatchedCard match={match} className="w-full" />
                </div>
                <div className="w-0 min-w-full">
                    <Caption label={<Maker suggestion={linked} isCurrent={linked.id === suggestion.id} />} />
                </div>
                <span />
                <div className="w-0 min-w-full">
                    <Caption label={`${cardMatchLabel(match)} - ${match.firstVersion.name}`} />
                </div>
            </div>
            <div
                className={classNames("flex min-w-0 flex-1 flex-col items-center gap-4", {
                    "md:items-start md:justify-center": isDeleting
                })}
            >
                <PointList points={linkPoints(match, nameOf(linked))} />
                {isDeleting && (
                    <div className="flex w-full flex-col items-center gap-3 border-t border-dashed border-danger/40 pt-3 md:items-start">
                        <span className="font-cinzel uppercase tracking-widest text-sm text-danger">
                            Will be deleted
                        </span>
                        <PointList
                            points={[
                                {
                                    icon: faTrashCan,
                                    text: `${deleting.length === 1 ? "It is" : `All ${deleting.length} are`} removed for good, and can't be brought back.`
                                }
                            ]}
                        />
                        <div className="flex flex-wrap justify-center gap-3 md:justify-start">
                            {deleting.map((option) => (
                                <Labelled
                                    key={option.id}
                                    className="w-24 sm:w-28"
                                    label={<Maker suggestion={option} isCurrent={option.id === suggestion.id} />}
                                >
                                    <SuggestionPiece
                                        suggestion={option}
                                        className="w-full"
                                        overlay={<DeleteMark isPlot={option.card.type === "plot"} size="sm" />}
                                    />
                                </Labelled>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    const pickSummary = `Link ${linked ? 1 : 0}${deleting.length > 0 ? ` · Delete ${deleting.length}` : ""}`;

    return (
        <ZoomGuardContext.Provider value={setIsZoomed}>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                isDismissable={!isLinking && !isZoomed}
                isKeyboardDismissDisabled={isZoomed}
                hideCloseButton={isLinking}
                size={hasChoice ? "5xl" : "3xl"}
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
                                    {isDeleting ? `Link 1 & Delete ${deleting.length}` : "Link"}
                                </Button>
                            </>
                        )}
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </ZoomGuardContext.Provider>
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
