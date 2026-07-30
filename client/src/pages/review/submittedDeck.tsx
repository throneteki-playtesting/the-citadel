import {
    faCheck,
    faClock,
    faExternalLink,
    faLayerGroup,
    faPlus,
    faX,
    faTriangleExclamation
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Textarea, Button, Accordion, AccordionItem, Chip, Skeleton, Link, Checkbox } from "@heroui/react";
import { DeckLink, DecklistLink, isThronesDbLink } from "common/types";
import { extractDeckIdentifier, isPlaytestingCode } from "common/utils";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useGetTDBDeckQuery, useLazyGetTDBCardQuery, useLazyGetTDBDeckQuery } from "../../api/thronesdb";
import { useWizard } from "../../components/wizard/context";
import { Code, ILabeledCard, IPlaytestCard } from "common/models/cards";
import { ReviewDeck } from "common/models/reviews";
import { DeepPartial } from "common/types";
import { sortBy } from "lodash-es";
import CardImage from "../../components/cardImage";
import CardStack from "../../components/cardStack";
import LoadingCard from "../../components/loadingCard";
import Timestamp from "../../components/timestamp";
import { TouchTooltip } from "../../components/touchTooltip";

const chipClassNames = { base: "whitespace-normal max-w-full h-auto py-0.5" };

type DeckEntry = { url: DeckLink | DecklistLink; broken: boolean; shared: boolean };

const toEntries = (decks: DeepPartial<ReviewDeck>[]): DeckEntry[] =>
    decks
        .filter((deck): deck is DeepPartial<ReviewDeck> & { link: DeckLink | DecklistLink } => !!deck.link)
        .map(({ link, shared }) => ({ url: link, broken: false, shared: shared ?? true }));

export default function SubmitDecks({ card, decks: initial = [], onValueChange: onDecksChange }: SubmitDecksProps) {
    const [entries, setEntries] = useState<DeckEntry[]>(toEntries(initial));
    const [deckUrlInput, setDeckUrlInput] = useState("");
    const [deckUrlInputError, setDeckUrlInputError] = useState<string | undefined>();
    const [fetchDeck] = useLazyGetTDBDeckQuery();
    const [isValidatingDeckUrl, setIsValidatingDeckUrl] = useState(false);

    const { validationErrors } = useWizard();

    useEffect(() => {
        setEntries(toEntries(initial));
    }, [initial]);

    useEffect(() => {
        if (validationErrors.decks) {
            setDeckUrlInputError(validationErrors.decks);
        }
    }, [validationErrors.decks]);

    const notifyChange = useCallback(
        (updated: DeckEntry[]) => {
            onDecksChange(updated.filter((e) => !e.broken).map((e) => ({ link: e.url, shared: e.shared })));
        },
        [onDecksChange]
    );

    const onAddDeck = useCallback(async () => {
        setIsValidatingDeckUrl(true);
        try {
            if (!isThronesDbLink(deckUrlInput)) {
                setDeckUrlInputError("ThronesDB link is invalid");
                return;
            }
            if (entries.some((e) => e.url === deckUrlInput)) {
                setDeckUrlInputError("ThronesDB deck already added");
                return;
            }
            const deckIdentifier = extractDeckIdentifier(deckUrlInput);
            if (!deckIdentifier) {
                setDeckUrlInputError("ThronesDB link is invalid");
                return;
            }
            const deck = await fetchDeck(deckIdentifier).unwrap();
            if (!deck) {
                setDeckUrlInputError("ThronesDB deck does not exist or is not public");
                return;
            }

            setDeckUrlInput("");
            setDeckUrlInputError(undefined);
            const updated = [...entries, { url: deckUrlInput, broken: false, shared: true }];
            setEntries(updated);
            notifyChange(updated);
        } finally {
            setIsValidatingDeckUrl(false);
        }
    }, [deckUrlInput, fetchDeck, entries, notifyChange]);

    const onRemoveDeck = useCallback(
        (url: DeckLink | DecklistLink) => {
            const updated = entries.filter((e) => e.url !== url);
            setEntries(updated);
            notifyChange(updated);
        },
        [entries, notifyChange]
    );

    const onDeckLinkBroken = useCallback((url: DeckLink | DecklistLink) => {
        setEntries((prev) => prev.map((e) => (e.url === url ? { ...e, broken: true } : e)));
    }, []);

    const onDeckSharedChange = useCallback(
        (url: DeckLink | DecklistLink, shared: boolean) => {
            const updated = entries.map((e) => (e.url === url ? { ...e, shared } : e));
            setEntries(updated);
            notifyChange(updated);
        },
        [entries, notifyChange]
    );

    return (
        <div className="space-y-2">
            <div className="text-base md:text-lg font-cinzel">Which deck(s) did you playtest this card with?</div>
            <div className="text-sm md:text-base font-sans">
                Provide at least one{" "}
                <a href="https://thronesdb.com/" target="_blank" className="text-primary hover:brightness-75">
                    ThronesDB
                </a>{" "}
                deck in which you playtested this card. For private decks, please ensure you have "Share your decks"
                checked in account settings.
            </div>
            <div className="w-full">
                <Textarea
                    aria-label="decks"
                    name="decks"
                    value={deckUrlInput}
                    onValueChange={(value) => {
                        setDeckUrlInput(value);
                        setDeckUrlInputError(undefined);
                    }}
                    className="max-w-[34rem]"
                    placeholder="Paste deck link here..."
                    isDisabled={isValidatingDeckUrl}
                    isInvalid={!!deckUrlInputError}
                    errorMessage={deckUrlInputError}
                    endContent={
                        <Button
                            onPress={onAddDeck}
                            className="mt-auto"
                            isIconOnly
                            radius="full"
                            color="primary"
                            size="sm"
                            isDisabled={!deckUrlInput}
                            isLoading={isValidatingDeckUrl}
                        >
                            <FontAwesomeIcon icon={faPlus} className="text-xl" />
                        </Button>
                    }
                />
            </div>
            <Accordion>
                <AccordionItem
                    isDisabled={entries.length === 0}
                    title={
                        <span className="font-crimson italic text-lg">
                            Submitted Decks {entries.length > 0 ? `(${entries.length})` : null}
                        </span>
                    }
                    classNames={{ trigger: "py-1" }}
                    textValue="Submitted Decks"
                    keepContentMounted
                >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-1">
                        {entries.map((entry) => (
                            <DeckSummary
                                key={entry.url}
                                card={card}
                                src={entry.url}
                                shared={entry.shared}
                                onDelete={onRemoveDeck}
                                onBroken={onDeckLinkBroken}
                                onSharedChange={onDeckSharedChange}
                            />
                        ))}
                    </div>
                </AccordionItem>
            </Accordion>
        </div>
    );
}

type SubmitDecksProps = {
    card: IPlaytestCard;
    decks?: DeepPartial<ReviewDeck>[];
    onValueChange: (value: ReviewDeck[]) => void;
};

function DeckSummary({ card, src, shared, onDelete, onBroken = () => true, onSharedChange }: DeckSummaryProps) {
    const identifier = extractDeckIdentifier(src);
    const { data: deck, isLoading } = useGetTDBDeckQuery(identifier!, { skip: !identifier });
    const [fetchCard] = useLazyGetTDBCardQuery();
    const [playtestedCards, setPlaytestedCards] = useState<(ILabeledCard | Code)[] | undefined>();

    useEffect(() => {
        const updateCards = async () => {
            let cards: (ILabeledCard | Code)[] = [];
            if (deck?.slots) {
                const cardCodes = Object.keys(deck.slots) as Code[];
                for (const cardCode of cardCodes) {
                    if (isPlaytestingCode(cardCode)) {
                        try {
                            const card = await fetchCard(cardCode).unwrap();
                            cards.push(card);
                        } catch {
                            cards.push(cardCode);
                        }
                    }
                }

                cards = sortBy(cards, ["code"]);
                setPlaytestedCards(cards);
            } else {
                setPlaytestedCards(undefined);
            }
        };
        updateCards();
    }, [deck?.slots, fetchCard]);

    useEffect(() => {
        if (!isLoading && !deck) {
            onBroken(src);
        }
    }, [deck, isLoading, onBroken, src]);

    const cardSummary = useMemo(() => {
        if (!playtestedCards) {
            return <Skeleton className="w-36 h-6 rounded-full" />;
        }

        const otherCards = playtestedCards.filter(
            (pCard) => (typeof pCard === "string" ? pCard : pCard.code) !== card.code
        );
        const otherChip = otherCards.length > 0 && (
            <TouchTooltip
                key="other"
                content={
                    <div className="text-sm font-sans max-w-56 whitespace-normal">
                        Also contains:{" "}
                        {otherCards.map((pCard) => (typeof pCard === "string" ? pCard : pCard.label)).join(", ")}
                    </div>
                }
                size="sm"
                delay={0}
                closeDelay={0}
            >
                <Chip
                    radius="sm"
                    variant="flat"
                    color="default"
                    classNames={chipClassNames}
                    startContent={<FontAwesomeIcon icon={faLayerGroup} className="ml-1" />}
                >
                    +{otherCards.length} other card{otherCards.length > 1 ? "s" : ""}
                </Chip>
            </TouchTooltip>
        );

        const updatedChip = deck && (
            <Chip
                key="updated"
                radius="sm"
                variant="flat"
                color="default"
                classNames={chipClassNames}
                startContent={<FontAwesomeIcon icon={faClock} className="ml-1" />}
            >
                Updated <Timestamp date={deck.updated} className="inline" />
            </Chip>
        );

        if (playtestedCards.length === 0) {
            return (
                <>
                    <TouchTooltip
                        content={
                            <div className="text-sm font-sans max-w-56 whitespace-normal">
                                This deck contains no playtesting cards. Please remove this deck & provide another.
                            </div>
                        }
                        size="sm"
                        delay={0}
                        closeDelay={0}
                    >
                        <Chip
                            radius="sm"
                            variant="flat"
                            color="warning"
                            classNames={chipClassNames}
                            startContent={<FontAwesomeIcon icon={faTriangleExclamation} className="ml-1" />}
                        >
                            No playtesting found
                        </Chip>
                    </TouchTooltip>
                    {updatedChip}
                </>
            );
        }
        if (
            !playtestedCards.some((pCard) =>
                typeof pCard === "string" ? pCard === card.code : pCard.code === card.code
            )
        ) {
            return (
                <>
                    <TouchTooltip
                        content={
                            <div className="text-sm font-sans max-w-56 whitespace-normal">
                                This deck contains no versions of the reviewed card. Are you sure it is the right deck?
                            </div>
                        }
                        size="sm"
                        delay={0}
                        closeDelay={0}
                    >
                        <Chip
                            radius="sm"
                            variant="flat"
                            color="warning"
                            classNames={chipClassNames}
                            startContent={<FontAwesomeIcon icon={faTriangleExclamation} className="ml-1" />}
                        >
                            Not Included
                        </Chip>
                    </TouchTooltip>
                    {otherChip}
                    {updatedChip}
                </>
            );
        }

        const copies = card.code ? deck?.slots[card.code] : undefined;

        return (
            <>
                <TouchTooltip
                    content={
                        <div className="text-sm font-sans max-w-56 whitespace-normal">
                            This deck runs {copies} cop{copies && copies > 1 ? "ies" : "y"} of the reviewed card.
                        </div>
                    }
                    size="sm"
                    delay={0}
                    closeDelay={0}
                >
                    <Chip
                        radius="sm"
                        variant="flat"
                        color="success"
                        classNames={chipClassNames}
                        startContent={<FontAwesomeIcon icon={faCheck} className="ml-1" />}
                    >
                        {copies ? `×${copies} ` : ""}Included
                    </Chip>
                </TouchTooltip>
                {otherChip}
                {updatedChip}
            </>
        );
    }, [card.code, playtestedCards, deck]);

    if (isLoading) {
        return (
            <div className="flex gap-1 p-1">
                <CardStack
                    cards={[undefined, undefined]}
                    tilt={{ amount: -0.2, depth: 14 }}
                    className="w-24 md:w-32 lg:w-24 xl:w-32"
                    shadow={false}
                >
                    {() => <LoadingCard className="rounded-lg" />}
                </CardStack>
                <div className="ml-14 md:ml-16 lg:ml-14 xl:ml-16 grow">
                    <Skeleton className="size-full rounded-md" />
                </div>
            </div>
        );
    }
    if (!deck) {
        return (
            <div className="relative border border-danger/30 bg-danger/10 rounded-lg p-3 animate-pulse">
                <div className="font-cinzel text-base md:text-lg text-danger">The Chain is Broken</div>
                <div className="font-crimson italic text-sm md:text-base text-danger/80">
                    A previously submitted deck can no longer be found — it has likely been cast aside or deleted.
                    Please delete, or submit a new one.
                </div>
                <Link className="font-crimson text-sm md:text-base italic text-danger/60" href={src} target="_blank">
                    View broken link
                </Link>
                {onDelete && (
                    <Button
                        className="absolute top-0 right-0 m-2"
                        isIconOnly
                        onPress={() => onDelete(src)}
                        size="sm"
                        radius="full"
                        variant="flat"
                        color="danger"
                    >
                        <FontAwesomeIcon icon={faX} />
                    </Button>
                )}
            </div>
        );
    }
    return (
        <div className="border border-content2 p-2">
            <div className="flex">
                <div className="font-cinzel text-lg">
                    {deck.name}{" "}
                    <Link href={src} target="_blank">
                        <FontAwesomeIcon icon={faExternalLink} />
                    </Link>
                </div>
                {onDelete && (
                    <Button
                        isIconOnly
                        className="ml-auto"
                        onPress={() => onDelete(src)}
                        size="sm"
                        radius="full"
                        color="danger"
                    >
                        <FontAwesomeIcon icon={faX} />
                    </Button>
                )}
            </div>
            <div className="flex gap-1 p-1">
                <div className="shrink-0">
                    <CardStack
                        cards={[...deck.agendas, deck.faction]}
                        tilt={{ amount: -0.2, depth: 14 / deck.agendas.length }}
                        className="w-24 md:w-32"
                        shadow={false}
                    >
                        {(card, index) => <CardImage key={index} card={card} className="rounded-lg" />}
                    </CardStack>
                </div>
                <div className="ml-14 md:ml-16 lg:ml-14 xl:ml-16 grow min-w-0 flex flex-wrap items-start content-start gap-1">
                    {cardSummary}
                </div>
            </div>
            {onSharedChange && (
                <Checkbox size="sm" isSelected={shared} onValueChange={(value) => onSharedChange(src, value)}>
                    <span className="text-sm font-sans">Share this deck for others to use</span>
                </Checkbox>
            )}
        </div>
    );
}

type DeckSummaryProps = {
    card: IPlaytestCard;
    src: DeckLink | DecklistLink;
    shared: boolean;
    onDelete?: (src: DeckLink | DecklistLink) => void;
    onBroken?: (src: DeckLink | DecklistLink) => void;
    onSharedChange?: (src: DeckLink | DecklistLink, shared: boolean) => void;
};
