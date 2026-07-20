import { useCallback, useEffect, useState } from "react";
import { IPlaytestCard } from "common/models/cards";
import { CardPreview } from "@agot/card-preview";
import { renderPlaytestingCard } from "common/utils";
import { addToast, Alert, Button, NumberInput, Textarea } from "@heroui/react";
import { IPlaytestReview } from "common/models/reviews";
import StatementAnswerIcon from "../../components/statementAnswerIcon";
import { DeepPartial } from "common/types";
import { PlaytestingReview } from "common/models/schemas";
import { useCreateReviewMutation, useLazyGetReviewQuery, useUpdateReviewMutation } from "../../api";
import { useAuth } from "../../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Wizard, WizardBack, WizardPage, WizardPages, ValidationSummary } from "../../components/wizard";
import SubmitDecks from "./submittedDeck";
import StatementQuestion from "./statementQuestion";
import SectionTitle from "../../components/sectionTitle";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleArrowLeft, faExternalLink, faScroll } from "@fortawesome/free-solid-svg-icons";
import { merge } from "lodash-es";
import CardSelection from "./cardSelection";
import classNames from "classnames";
import { UserChip } from "../admin/logs/chips";

const defaultData = {
    decks: [],
    statements: {
        boring: undefined,
        competitive: undefined,
        creative: undefined,
        balanced: undefined,
        releasable: undefined
    }
};
export default function ReviewForm({ card: initialCard, reviewer: targetReviewer }: ReviewFormProps) {
    const navigate = useNavigate();
    const [readReview] = useLazyGetReviewQuery();
    const [createReview, { isLoading: isCreating }] = useCreateReviewMutation();
    const [updateReview, { isLoading: isUpdating }] = useUpdateReviewMutation();

    const { user } = useAuth();
    const reviewer = targetReviewer ?? user?.discordId;
    const isOwnReview = !targetReviewer || targetReviewer === user?.discordId;

    const [review, setReview] = useState<DeepPartial<IPlaytestReview>>(defaultData);
    const [isNew, setIsNew] = useState(true);
    const [card, setCard] = useState<IPlaytestCard>();
    // Changing the card would break the reviewer/version binding when editing someone else's or an outdated review
    const canChangeCard = isOwnReview && (!card || card.latest);

    useEffect(() => {
        setReview((prev) => ({ ...prev, reviewer }));
    }, [reviewer]);

    useEffect(() => {
        setCard(initialCard);
    }, [initialCard]);

    useEffect(() => {
        const checkCardUpdate = async () => {
            if (card && reviewer) {
                try {
                    const filter = { project: card.project, number: card.number, version: card.version, reviewer };
                    const existingReview = await readReview(filter, true).unwrap();
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
            setReview(merge({}, defaultData, { reviewer, project: card?.project, number: card?.number, version: card?.version }));
            setIsNew(true);
        };
        checkCardUpdate();
    }, [card, readReview, reviewer]);

    const onSubmit = useCallback(async (review: IPlaytestReview) => {
        const newReview = isNew ? await createReview(review).unwrap() : await updateReview(review).unwrap();
        setReview(newReview);
        navigate(`/project/${newReview.project}/${newReview.number}`);
        addToast({ title: "Successfully saved", color: "success", description: `Review for "${card?.name}" has been ${isNew ? "submitted" : "updated"}` });
    }, [card?.name, createReview, isNew, navigate, updateReview]);

    return (
        <div className="space-y-2">
            <Wizard schema={PlaytestingReview.Draft} onSubmit={onSubmit} data={review} page={initialCard ? 2 : 1}>
                <ValidationSummary />
                <WizardPages>
                    <WizardPage>
                        <div className="font-cinzel text-3xl">
                            Choose your subject
                        </div>
                        <div className="font-crimson text-lg">
                            Search for and select a card from the archives, then proceed to render your verdict.
                        </div>
                        <CardSelection value={card} onSelect={setCard} searchValue={initialCard?.name} />
                    </WizardPage>
                    <WizardPage controlledData={review}>
                        <div className="font-cinzel text-3xl">
                            {isNew
                                ? "Render your Verdict"
                                : `${isOwnReview ? "Your" : "This reviewer's"} verdict has already been rendered`
                            }
                        </div>
                        <div className="text-lg">
                            {isNew
                                ? "Each verdict submitted to the Citadel provides the team with the tracked insights needed to refine a card's design — speak plainly and honestly of your findings."
                                : isOwnReview
                                    ? "You have already submitted a review for this version — you may amend your scroll at any time."
                                    : <span className="inline-flex items-center gap-1 flex-wrap">You are amending <UserChip value={reviewer!} />&apos;s review for this version on their behalf.</span>
                            }
                        </div>
                        {card && !card.latest && (
                            <Alert color="warning" icon={<FontAwesomeIcon icon={faScroll} />} title="Amending an aged scroll" classNames={{ title: "font-bold text-sm md:text-md lg:text-lg" }}>
                                <div className="text-xs md:text-sm lg:text-md italic">
                                    You are editing a review for version {card.version} of this card, which is no longer the current version.
                                </div>
                            </Alert>
                        )}
                        <div className={classNames("flex gap-2 items-center w-full", canChangeCard ? "justify-between" : "justify-end")}>
                            {canChangeCard && (
                                <WizardBack onCancel={() => true} startContent={<FontAwesomeIcon icon={faCircleArrowLeft}/>}>
                                    Change Card
                                </WizardBack>
                            )}
                            <Button as="a" color="secondary" isDisabled={!card} endContent={<FontAwesomeIcon icon={faExternalLink}/>} href={card ? `/project/${card.project}/${card.number}` : undefined} target="_blank" rel="noopener noreferrer">
                                View Card Page
                            </Button>
                        </div>
                        {card && <>
                            <div className="flex flex-col items-center gap-2 md:flex-row md:items-start md:gap-4">
                                <CardPreview card={renderPlaytestingCard(card)} className="max-w-64"/>
                                <div className="space-y-2">
                                    <SectionTitle>
                                        Playtesting Information
                                    </SectionTitle>
                                    <div className="flex flex-col w-full">
                                        <div className="text-base md:text-lg font-cinzel">How many games have you played with this card?</div>
                                        <NumberInput
                                            name="played"
                                            value={review.played ?? 0}
                                            onValueChange={(played) => setReview((prev) => ({ ...prev, played }))}
                                            minValue={0}
                                            maxValue={999}
                                            placeholder="Test"
                                            size="lg"
                                            classNames={{ mainWrapper: "max-w-24", inputWrapper: "h-10", input: "text-2xl" }}
                                        />
                                    </div>
                                    <SubmitDecks decks={review?.decks} card={card} onValueChange={(decks) => setReview((prev) => ({ ...prev, decks }))}/>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1 p-2 w-full">
                                <SectionTitle>
                                    Review Questions
                                </SectionTitle>
                                <div className="font-sans">Respond to the following questions in how much you agree (<StatementAnswerIcon answer="somewhat agree"/>) or disagree (<StatementAnswerIcon answer="somewhat disagree"/>).</div>
                                <div className="space-y-1">
                                    <StatementQuestion name="statements.boring" statement="Is it boring?" answer={review.statements?.boring} onValueChange={(boring) => setReview((prev) => ({ ...prev, statements: { ...prev.statements, boring } }))}/>
                                    <StatementQuestion name="statements.competitive" statement="Will it see competitive play?" answer={review.statements?.competitive} onValueChange={(competitive) => setReview((prev) => ({ ...prev, statements: { ...prev.statements, competitive } }))}/>
                                    <StatementQuestion name="statements.creative" statement="Does it encourage creativity?" answer={review.statements?.creative} onValueChange={(creative) => setReview((prev) => ({ ...prev, statements: { ...prev.statements, creative } }))}/>
                                    <StatementQuestion name="statements.balanced" statement="Is it balanced?" answer={review.statements?.balanced} onValueChange={(balanced) => setReview((prev) => ({ ...prev, statements: { ...prev.statements, balanced } }))}/>
                                    <StatementQuestion name="statements.releasable" statement="Could it be released as is?" answer={review.statements?.releasable} onValueChange={(releasable) => setReview((prev) => ({ ...prev, statements: { ...prev.statements, releasable } }))}/>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1 p-2 w-full">
                                <SectionTitle>
                                    Additional Comments
                                </SectionTitle>
                                <Textarea
                                    name="additional"
                                    placeholder="Provide comments here..."
                                    value={review.additional ?? ""}
                                    onValueChange={(additional) => setReview((prev) => ({ ...prev, additional }))}
                                    classNames={{
                                        input: "text-sm md:text-base"
                                    }}
                                    minRows={10}
                                    maxRows={30}
                                />
                            </div>
                        </>}
                        <Button
                            type="submit"
                            color="primary"
                            isLoading={isCreating || isUpdating}
                            className="ml-auto"
                            size="lg"
                        >
                            {isNew ? "Submit Review" : "Update Review"}
                        </Button>
                    </WizardPage>
                </WizardPages>
            </Wizard>
        </div>
    );
};

type ReviewFormProps = {
    review?: DeepPartial<IPlaytestReview>;
    card?: IPlaytestCard;
    reviewer?: string;
}