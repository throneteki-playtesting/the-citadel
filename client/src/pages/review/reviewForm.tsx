import { useCallback, useEffect, useMemo, useState } from "react";
import { Code, ILabeledCard, IPlaytestCard } from "common/models/cards";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChainBroken, faExternalLink, faMagnifyingGlass, faThumbsDown, faThumbsUp, faWarning, faX } from "@fortawesome/free-solid-svg-icons";
import { CardPreview } from "@agot/card-preview";
import { extractDeckIdentifier, isPlaytestingCode, renderPlaytestingCard, thronesColors } from "common/utils";
import ThronesIcon from "../../components/thronesIcon";
import CardsAutocomplete from "../../components/data/cardsAutocomplete";
import { addToast, Alert, Button, Card, Link, NumberInput, Skeleton, Slider, Textarea } from "@heroui/react";
import { IPlaytestReview, StatementAnswer, statementAnswers } from "common/models/reviews";
import { DeckLink, DecklistLink, DeepPartial, isThronesDbLink } from "common/types";
import { PlaytestingReview } from "common/models/schemas";
import { useGetDeckQuery, useLazyGetCardQuery, useLazyGetDeckQuery } from "../../api/thronesdb";
import { useSelector } from "react-redux";
import { RootState } from "../../api/store";
import { useCreateReviewMutation, useLazyGetReviewQuery, useUpdateReviewMutation } from "../../api";
import classNames from "classnames";
import { useNavigate } from "react-router-dom";
import Form from "../../components/form";
import { useForm } from "../../components/form/context";
import { sortBy } from "lodash-es";
import CardImage from "../../components/cardImage";
import LoadingCard from "../../components/loadingCard";
import Loading from "../../components/loading";


const titleClassname = "text-small md:text-medium lg:text-large font-bold";
const descriptionClassName = "text-tiny md:text-small lg:text-medium";

const ReviewForm = ({ review: initial }: ReviewFormProps) => {
    const navigate = useNavigate();
    const [readReview, { isLoading: isReading }] = useLazyGetReviewQuery();
    const [createReview, { isLoading: isCreating }] = useCreateReviewMutation();
    const [updateReview, { isLoading: isUpdating }] = useUpdateReviewMutation();
    const user = useSelector((state: RootState) => state.auth.user);

    const defaultData = useMemo(() => ({
        reviewer: user?.discordId,
        decks: [],
        statements: {
            boring: undefined,
            competitive: undefined,
            creative: undefined,
            balanced: undefined,
            releasable: undefined
        }
    }), [user?.discordId]);

    const [review, setReview] = useState<DeepPartial<IPlaytestReview>>({});
    const [isNew, setIsNew] = useState(true);
    const [card, setCard] = useState<IPlaytestCard>();

    useEffect(() => {
        setReview({
            ...defaultData,
            ...initial
        });
    }, [defaultData, initial]);

    const onCardChange = useCallback(async (card?: IPlaytestCard) => {
        setCard(card);
        if (card && user) {
            try {
                const filter = { project: card.project, number: card.number, version: card.version, reviewer: user.discordId };
                const existingReview = await readReview(filter).unwrap();
                // If review already exists, save it. Otherwise, set to default values + card values
                if (existingReview) {
                    setReview(existingReview);
                    setIsNew(false);
                    return;
                }
            } catch {
                // Do nothing
            }
        }
        setReview({ ...defaultData, project: card?.project, number: card?.number, version: card?.version });
        setIsNew(true);
    }, [defaultData, readReview, user]);

    const onSubmit = useCallback(async (review: IPlaytestReview) => {
        setReview(review);
        try {
            const newReview = isNew ? await createReview(review).unwrap() : await updateReview(review).unwrap();
            // Saves the version
            setReview(newReview);
            navigate(`/project/${newReview.project}/${newReview.number}`);
            addToast({ title: "Successfully saved", color: "success", description: `Review for "${card?.name}" has been ${isNew ? "submitted" : "updated"}` });
        } catch (err) {
            // TODO: Better error handling from redux (eg. use ApiError.message for description)
            addToast({ title: "Failed to save", color: "danger", description: "An unknown error has occurred" });
        }
    }, [card?.name, createReview, isNew, navigate, updateReview]);

    return (
        <div className="w-full max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-full space-y-2">
            <div>
                <div className="text-large md:text-xl lg:text-2xl font-bold pb-1 md:pb-3">{`${isNew ? "New" : "Edit"} Review`}</div>
                <div className="text-small md:text-medium lg:text-large">
                    <div>Each playtesting review provides the team with tracked insights needed to refine card performance, so please be completely honest with your findings.</div>
                    <div>You can only submit one review per card/version, however you may edit an existing review at any time.</div>
                </div>
            </div>
            <Form
                data={review}
                schema={PlaytestingReview.Draft}
                onSubmit={onSubmit}
                className="flex flex-col gap-1 md:gap-2"
            >
                <Card className="flex flex-col gap-1 p-2 sm:p-3 md:p-4 lg:p-5 w-full">
                    <CardSelection filter={{ project: review?.project, number: review?.number }} value={card} onValueChange={onCardChange}/>
                </Card>
                {isReading && <Loading className="w-full p-5" label=""/>}
                <div className={classNames("flex flex-col gap-1 md:gap-2 w-full transition-all duration-1000 overflow-hidden", { "max-h-0": !card, "max-h-[10000px]": card })}>
                    <Card className="flex flex-col gap-1 p-2 sm:p-3 md:p-4 lg:p-5">
                        <div>
                            <div className={titleClassname}>Games Played</div>
                            <div className={descriptionClassName}>Roughly how many games have you played with this card?</div>
                        </div>
                        <NumberInput aria-label="played" name="played" value={review.played ?? 0} onValueChange={(value) => setReview((prev) => ({ ...prev, played: value }))}minValue={0} classNames={{ inputWrapper: "h-10", input: "text-small md:text-medium" }}/>
                    </Card>
                    <Card className="flex flex-col gap-1 p-2 sm:p-3 md:p-4 lg:p-5">
                        <DecksQuestion value={review?.decks ?? []} onValueChange={(decks) => setReview((prev) => ({ ...prev, decks }))}/>
                    </Card>
                    <Card className="flex flex-col gap-1 p-2 sm:p-3 md:p-4 lg:p-5">
                        <div>
                            <div className={titleClassname}>Statements</div>
                            <div className={descriptionClassName}>How strongly do you agree/disagree with the following statements for this card?</div>
                        </div>
                        <StatementQuestion name="statements.boring" statement="It is boring" answer={review.statements?.boring} onValueChange={(answer) => setReview((prev) => ({ ...prev, statements: { ...prev.statements, boring: answer } }))}/>
                        <StatementQuestion name="statements.competitive" statement="It will see competitive play" answer={review.statements?.competitive} onValueChange={(answer) => setReview((prev) => ({ ...prev, statements: { ...prev.statements, competitive: answer } }))}/>
                        <StatementQuestion name="statements.creative" statement="It inspires creative, fun or jank ideas" answer={review.statements?.creative} onValueChange={(answer) => setReview((prev) => ({ ...prev, statements: { ...prev.statements, creative: answer } }))}/>
                        <StatementQuestion name="statements.balanced" statement="It is balanced" answer={review.statements?.balanced} onValueChange={(answer) => setReview((prev) => ({ ...prev, statements: { ...prev.statements, balanced: answer } }))}/>
                        <StatementQuestion name="statements.releasable" statement="It could be released as is" answer={review.statements?.releasable} onValueChange={(answer) => setReview((prev) => ({ ...prev, statements: { ...prev.statements, releasable: answer } }))}/>
                    </Card>
                    <Card className="flex flex-col gap-1 p-2 sm:p-3 md:p-4 lg:p-5">
                        <div>
                            <div className={titleClassname}>Additional Comments?</div>
                        </div>
                        <Textarea
                            name="additional"
                            placeholder="Provide comments here..."
                            classNames={{
                                input: "text-small md:text-medium"
                            }}
                            minRows={10}
                            maxRows={30}
                        />
                    </Card>
                    <div className="flex justify-center">
                        <Button type="submit" color="primary" isLoading={isCreating || isUpdating} className="w-full max-w-64 text-small md:text-medium lg:text-large">{isNew ? "Submit Review" : "Update Review"}</Button>
                    </div>
                </div>
            </Form>
        </div>
    );
};

type ReviewFormProps = { review?: DeepPartial<IPlaytestReview> }

const CardSelection = ({ filter, value: card, onValueChange: onCardChange }: CardSelectionProps) => {
    return (
        <>
            <div>
                <div className={titleClassname}>Select Card</div>
                <div className={descriptionClassName}>Choose the card you would like to review. You can only review the latest version of a card.</div>
            </div>
            <CardsAutocomplete
                name="number"
                filter={{ project: filter.project, latest: true }}
                startContent={<FontAwesomeIcon icon={faMagnifyingGlass}/>}
                placeholder="Search for card..."
                itemHeight={52}
                mapKey={(card) => `${card.project}|${card.number}`}
                selectedKey={filter.project && filter.number ? `${filter.project}|${filter.number}` : undefined}
                onSelectionChange={onCardChange}
                inputProps={{
                    classNames: {
                        input: "text-small md:text-medium"
                    }
                }}
            >
                {(card) => (
                    <div className="flex items-center gap-2 p-2">
                        <div><ThronesIcon name={card.faction} className="text-large md:text-xl"/></div>
                        <div className="flex flex-col">
                            <div className="text-small md:text-medium">{card.name}</div>
                            <div className="text-tiny md:text-small">{card.version}</div>
                        </div>
                    </div>
                )}
            </CardsAutocomplete>
            {card && <CardPreview card={renderPlaytestingCard(card ?? {})} className="self-center shrink-0 max-w-64"/>}
        </>
    );
};

type CardSelectionProps = { filter: { project?: number, number?: number }, value?: IPlaytestCard, onValueChange: (card?: IPlaytestCard) => void }

const DecksQuestion = ({ value: decks, onValueChange: onDecksChange }: DecksQuestionProps) => {
    const [deckUrlInput, setDeckUrlInput] = useState("");
    const [deckUrlInputError, setDeckUrlInputError] = useState<string | undefined>();
    const [fetchDeck] = useLazyGetDeckQuery();
    const [isValidatingDeckUrl, setIsValidatingDeckUrl] = useState(false);
    const [missingDecks, setMissingDecks] = useState<(DeckLink|DecklistLink)[]>([]);

    const { validationErrors } = useForm();

    const onAddDeck = useCallback(async () => {
        setIsValidatingDeckUrl(true);
        if (!isThronesDbLink(deckUrlInput)) {
            setDeckUrlInputError("Invalid ThronesDB deck URL");
        } else if (decks.includes(deckUrlInput)) {
            setDeckUrlInputError("Deck has already been added");
        } else {
            const deckIdentifier = extractDeckIdentifier(deckUrlInput);
            try {
                if (!deckIdentifier) {
                    throw new Error("Deck Identifier could not be extracted");
                }
                await fetchDeck(deckIdentifier).unwrap();

                // Deck is valid
                setDeckUrlInput("");
                setDeckUrlInputError(undefined);

                const newDecks = [...decks, deckUrlInput];
                onDecksChange(newDecks);
            } catch (err) {
                setDeckUrlInputError("ThronesDB deck does not exist or is not public");
            }
        }
        setIsValidatingDeckUrl(false);
    }, [deckUrlInput, fetchDeck, onDecksChange, decks]);

    const onRemoveDeck = useCallback((deck: DeckLink | DecklistLink) => {
        const newDecks = decks.filter((d) => d !== deck) ?? [];
        onDecksChange(newDecks);
        setMissingDecks((prev) => prev.filter((d) => d !== deck) ?? []);
    }, [decks, onDecksChange]);

    useEffect(() => {
        if (validationErrors.decks) {
            setDeckUrlInputError(validationErrors.decks);
        }
    }, [validationErrors.decks]);

    const onDeckLinkBroken = useCallback((deck: DeckLink | DecklistLink) => {
        if (decks.includes(deck)) {
            onRemoveDeck(deck);
        }
        if (!missingDecks.includes(deck)) {
            setMissingDecks((prev) => [...prev, deck]);
        }
    }, [decks, missingDecks, onRemoveDeck]);

    const rendering = useMemo(() => [...decks, ...missingDecks], [decks, missingDecks]);

    return (
        <>
            <div>
                <div className={titleClassname}>Decks</div>
                <div className={descriptionClassName}>Please provide at least one <Link className={descriptionClassName} href="https://thronesdb.com/" target="_blank" >ThronesDB</Link> deck in which you playtested this card.</div>
                <div className={classNames(descriptionClassName, "text-tiny italic pt-1 md:pt-2")}>For private decks, please ensure you have "Share your decks" checked in account settings.</div>
            </div>
            <div className="space-y-2">
                <div className="sm:flex sm:gap-1 sm:items-stretch">
                    <Textarea
                        aria-label="decks"
                        name="decks"
                        value={deckUrlInput}
                        onValueChange={(value) => {
                            setDeckUrlInput(value);
                            setDeckUrlInputError(undefined);
                        }}
                        placeholder="Paste deck link here..."
                        classNames={{
                            inputWrapper: "rounded-b-none sm:rounded-md",
                            input: "text-small md:text-medium"
                        }}
                        isDisabled={isValidatingDeckUrl}
                        isInvalid={!!deckUrlInputError}
                        errorMessage={deckUrlInputError}
                    />
                    <Button className="w-full rounded-t-none sm:rounded-md sm:w-auto sm:h-auto text-small md:text-medium" onPress={onAddDeck} color="primary" isDisabled={!deckUrlInput} isLoading={isValidatingDeckUrl}>Add deck</Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                    {rendering.map((deck) => <DeckSummary key={deck} src={deck} onDelete={onRemoveDeck} onBroken={onDeckLinkBroken}/>)}
                </div>
            </div>
        </>
    );
};

type DecksQuestionProps = { value: (DeckLink | DecklistLink)[], onValueChange: (value: (DeckLink | DecklistLink)[]) => void }

const DeckSummary = ({ src, onDelete, onBroken = () => true }: DeckSummaryProps) => {
    const identifier = extractDeckIdentifier(src);
    const { data: deck, isLoading } = useGetDeckQuery(identifier!, { skip: !identifier });
    const [fetchCard] = useLazyGetCardQuery();
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
            return <Skeleton className="rounded-md min-h-16"/>;
        }
        if (playtestedCards.length === 0) {
            return (
                <Alert icon={<FontAwesomeIcon icon={faWarning}/>} color="danger" className="animate-pulse">
                    <div>
                        <div className="text-small">Warning</div>
                        <div className="text-tiny">Deck contains no playtesting cards</div>
                    </div>
                </Alert>
            );
        }
        return (
            <div className="flex flex-col gap-0.5">
                <div className="text-tiny font-semibold">Playtesting Cards</div>
                {playtestedCards?.map((card) => {
                    if (typeof card === "string") {
                        const code = card;
                        return (
                            <div key={code} className="text-tiny space-x-0.5" >
                                <FontAwesomeIcon icon={faWarning} className="text-orange-400 animate-pulse"/>
                                <span className="italic">{code}</span>
                            </div>
                        );
                    }
                    return (
                        <div key={card.code} className="text-tiny space-x-0.5" style={{ color: thronesColors[card.faction] }}>
                            <ThronesIcon name={card.type}/>
                            <span>{card.label}</span>
                        </div>
                    );
                })}
            </div>
        );
    }, [playtestedCards]);
    if (isLoading) {
        return (
            <Card className="min-h-22 p-2 space-y-2">
                <Skeleton className="h-8 w-full rounded-lg"/>
                <div className="grid grid-cols-4 gap-0.5">
                    <LoadingCard />
                    <LoadingCard />
                </div>
                <Skeleton className="h-8 w-2/3 rounded-lg"/>
            </Card>
        );
    }
    if (!deck) {
        return (
            <Alert icon={<FontAwesomeIcon icon={faChainBroken}/>} color="danger" className="relative animate-pulse">
                <div className="text-medium md:text-large">Warning</div>
                <div className="text-small md:text-medium">Previously submitted deck cannot be used for this review as it can no longer be accessed, likely due to being deleted.</div>
                <Link className="text-small md:text-medium italic" href={src} target="_blank">View broken link</Link>
                {onDelete && (
                    <Button className="absolute top-0 right-0 m-2" isIconOnly onPress={() => onDelete(src)} size="sm" radius="full" variant="flat">
                        <FontAwesomeIcon icon={faX}/>
                    </Button>
                )}
            </Alert>
        );
    }
    return (
        <Card className="min-h-22 p-2">
            <div className="flex">
                <div className="grow text-medium font-semibold">
                    {deck.name} <Link href={src} target="_blank"><FontAwesomeIcon icon={faExternalLink}/></Link>
                </div>
                {onDelete && (
                    <Button isIconOnly onPress={() => onDelete(src)} size="sm" radius="full" variant="flat">
                        <FontAwesomeIcon icon={faX}/>
                    </Button>
                )}
            </div>
            <div className="flex flex-col gap-1">
                <div className="grid grid-cols-4 gap-0.5">
                    <CardImage key={deck.faction} card={deck.faction} />
                    {deck.agendas.map((code) => <CardImage key={code} card={code}/>)}
                </div>
                <div>
                    {cardSummary}
                </div>
            </div>
        </Card>
    );
};

type DeckSummaryProps = { src: DeckLink | DecklistLink, onDelete?: (src: DeckLink | DecklistLink) => void, onBroken?: (src: DeckLink | DecklistLink) => void }

const StatementQuestion = ({ name, statement, answer, onValueChange = () => true }: StatementQuestionProps) => {
    const { validationErrors } = useForm();
    const value = useMemo(() => answer ? statementAnswers.indexOf(answer) : undefined, [answer]);

    return (
        <div>
            <Slider
                aria-label={name}
                name={name}
                classNames={{
                    base: "gap-0 pointer",
                    thumb: classNames({ "hidden": value === undefined }),
                    step: classNames({ "data-[in-range=true]:bg-default-300/50": value === undefined })
                }}
                label={<span className="text-small md:text-medium font-semibold">{statement}</span>}
                minValue={0}
                maxValue={statementAnswers.length - 1}
                value={value ?? 0}
                size="md"
                showSteps
                hideValue
                onChange={(value) => onValueChange(statementAnswers[Math.round(value as number)])}
                startContent={<FontAwesomeIcon icon={faThumbsDown}/>}
                endContent={<FontAwesomeIcon icon={faThumbsUp}/>}
                renderValue={() => <div className="capitalize text-tiny sm:text-small md:text-medium italic">{answer}</div>}
                className="mt-1 sm:mt-2 md:mt-3 lg:mt-4"
            />
            {name && validationErrors[name] && <div className="text-tiny text-danger">{validationErrors[name]}</div>}
        </div>
    );
};

type StatementQuestionProps = { name?:string, statement: string, answer?: StatementAnswer, onValueChange?: (value: StatementAnswer) => void }

export default ReviewForm;