import { useCallback, useEffect, useState } from "react";
import { IPlaytestCard } from "common/models/cards";
import { CardPreview } from "@agot/card-preview";
import { hasPermission, isDirty, renderPlaytestingCard } from "common/utils";
import { addToast, Alert, Button, ButtonGroup, NumberInput, Textarea } from "@heroui/react";
import { IPlaytestReview } from "common/models/reviews";
import Permission from "common/models/permissions";
import StatementAnswerIcon from "../../components/statementAnswerIcon";
import { DeepPartial } from "common/types";
import { PlaytestingReview } from "common/models/schemas";
import {
    useCreateReviewMutation,
    useDeleteReviewMutation,
    useLazyGetReviewQuery,
    useUpdateReviewMutation
} from "../../api";
import { useAuth } from "../../hooks/useAuth";
import { Wizard, WizardBack, WizardPage, WizardPages, ValidationSummary } from "../../components/wizard";
import { useWizard } from "../../components/wizard/context";
import SubmitDecks from "./submittedDeck";
import StatementQuestion from "./statementQuestion";
import SectionTitle from "../../components/sectionTitle";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleArrowLeft, faExternalLink, faFlask, faScroll } from "@fortawesome/free-solid-svg-icons";
import { merge } from "lodash-es";
import CardSelection from "./cardSelection";
import classNames from "classnames";
import { UserChip } from "../admin/logs/chips";
import { showApiErrorToast } from "../../api/errors";
import ConfirmDeleteReviewModal from "./confirmDeleteReviewModal";

const defaultData: DeepPartial<IPlaytestReview> = {
    played: 1,
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
    const [readReview] = useLazyGetReviewQuery();
    const [createReview, { isLoading: isCreating }] = useCreateReviewMutation();
    const [updateReview, { isLoading: isUpdating }] = useUpdateReviewMutation();
    const [deleteReview, { isLoading: isDeleting }] = useDeleteReviewMutation();

    const { user } = useAuth();
    const reviewer = targetReviewer ?? user?.discordId;
    const isOwnReview = !targetReviewer || targetReviewer === user?.discordId;
    const canDelete =
        hasPermission(user, Permission.DELETE_REVIEWS) || (hasPermission(user, Permission.MAKE_REVIEWS) && isOwnReview);

    const [review, setReview] = useState<DeepPartial<IPlaytestReview>>(defaultData);
    // What the update button compares the draft against, so an untouched review can't be re-saved for nothing
    const [committedReview, setCommittedReview] = useState<DeepPartial<IPlaytestReview>>();
    const [isNew, setIsNew] = useState(true);
    const [hasPlaytested, setHasPlaytested] = useState(true);
    const [card, setCard] = useState<IPlaytestCard>();
    // Changing the card would break the reviewer/version binding when editing someone else's or an outdated review
    const canChangeCard = isOwnReview && (!card || card.latest);
    // Only meaningful on the initial render - the Wizard owns page navigation from here on
    const [wizardPage] = useState(initialCard ? 2 : 1);
    const [searchValue, setSearchValue] = useState(initialCard?.name);

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
                        setCommittedReview(existingReview);
                        setIsNew(false);
                        setHasPlaytested((existingReview.played ?? 0) > 0);
                        return;
                    }
                } catch {
                    // Do nothing
                }
            }
            setReview(
                merge({}, defaultData, {
                    reviewer,
                    project: card?.project,
                    number: card?.number,
                    version: card?.version
                })
            );
            setCommittedReview(undefined);
            setIsNew(true);
            setHasPlaytested(true);
        };
        checkCardUpdate();
    }, [card, readReview, reviewer]);

    // A fresh review has nothing to be dirty against - only an existing one can be untouched
    const isReviewDirty = isNew || isDirty(committedReview, review);

    const onSubmit = useCallback(
        async (validReview: IPlaytestReview) => {
            if (!hasPlaytested) {
                validReview = { ...validReview, played: 0, decks: [] };
            }
            const newReview = isNew
                ? await createReview(validReview).unwrap()
                : await updateReview(validReview).unwrap();
            setReview(newReview);
            setCommittedReview(newReview);
            setIsNew(false);
            addToast({
                title: "Successfully saved",
                color: "success",
                description: `Review for "${card?.name}" has been ${isNew ? "submitted" : "updated"}`
            });
        },
        [card?.name, createReview, hasPlaytested, isNew, updateReview]
    );

    // Returns whether the delete went through, so the caller knows whether it's safe to move on
    const onDelete = useCallback(async (): Promise<boolean> => {
        if (!committedReview?.project || !committedReview?.number || !committedReview?.version || !reviewer) {
            return false;
        }
        try {
            await deleteReview({
                project: committedReview.project,
                number: committedReview.number,
                version: committedReview.version,
                reviewer
            }).unwrap();
            addToast({
                title: "Review deleted",
                color: "success",
                description: `Review for "${card?.name}" has been deleted`
            });
            setCard(undefined);
            setSearchValue("");
            return true;
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to delete review" });
            return false;
        }
    }, [card?.name, committedReview, deleteReview, reviewer]);

    return (
        <div className="space-y-2">
            <Wizard schema={PlaytestingReview.Draft} onSubmit={onSubmit} data={review} page={wizardPage}>
                <ValidationSummary />
                <WizardPages>
                    <WizardPage>
                        <div className="font-cinzel text-3xl">Choose your subject</div>
                        <div className="font-crimson text-lg">
                            Search for and select a card from the archives, then proceed to render your verdict.
                        </div>
                        <CardSelection value={card} onSelect={setCard} searchValue={searchValue} />
                    </WizardPage>
                    <WizardPage controlledData={review}>
                        <div className="font-cinzel text-3xl">
                            {isNew
                                ? "Render your Verdict"
                                : `${isOwnReview ? "Your" : "This reviewer's"} verdict has already been rendered`}
                        </div>
                        <div className="text-lg">
                            {isNew ? (
                                "Each verdict submitted to the Citadel provides the team with the tracked insights needed to refine a card's design — speak plainly and honestly of your findings."
                            ) : isOwnReview ? (
                                "You have already submitted a review for this version — you may amend your scroll at any time."
                            ) : (
                                <span className="inline-flex items-center gap-1 flex-wrap">
                                    You are amending <UserChip value={reviewer!} />
                                    &apos;s review for this version on their behalf.
                                </span>
                            )}
                        </div>
                        {card && !card.latest && (
                            <Alert
                                color="warning"
                                icon={<FontAwesomeIcon icon={faScroll} />}
                                title="Amending an aged scroll"
                                classNames={{ title: "font-bold text-sm md:text-md lg:text-lg" }}
                            >
                                <div className="text-xs md:text-sm lg:text-md italic">
                                    You are editing a review for version {card.version} of this card, which is no longer
                                    the current version.
                                </div>
                            </Alert>
                        )}
                        <div
                            className={classNames(
                                "flex gap-2 items-center w-full",
                                canChangeCard ? "justify-between" : "justify-end"
                            )}
                        >
                            {canChangeCard && (
                                <WizardBack
                                    onCancel={() => true}
                                    startContent={<FontAwesomeIcon icon={faCircleArrowLeft} />}
                                >
                                    Change Card
                                </WizardBack>
                            )}
                            <Button
                                as="a"
                                color="secondary"
                                isDisabled={!card}
                                endContent={<FontAwesomeIcon icon={faExternalLink} />}
                                href={card ? `/project/${card.project}/${card.number}` : undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                View Card Page
                            </Button>
                        </div>
                        {card && (
                            <>
                                <div className="flex flex-col items-center gap-2 md:flex-row md:items-start md:gap-4">
                                    <CardPreview card={renderPlaytestingCard(card)} className="max-w-64" />
                                    <div className="space-y-2">
                                        <SectionTitle>Playtesting Information</SectionTitle>
                                        <div className="flex flex-col w-full gap-1">
                                            <div className="text-base md:text-lg font-cinzel">
                                                Have you playtested this card?
                                            </div>
                                            <ButtonGroup size="lg" className="self-start">
                                                <Button
                                                    color={hasPlaytested ? "primary" : "default"}
                                                    variant="bordered"
                                                    onPress={() => {
                                                        setHasPlaytested(true);
                                                        setReview((prev) => ({ ...prev, played: prev.played || 1 }));
                                                    }}
                                                >
                                                    Yes
                                                </Button>
                                                <Button
                                                    color={!hasPlaytested ? "primary" : "default"}
                                                    variant="bordered"
                                                    onPress={() => {
                                                        setHasPlaytested(false);
                                                        setReview((prev) => ({ ...prev, played: 0, decks: [] }));
                                                    }}
                                                >
                                                    No
                                                </Button>
                                            </ButtonGroup>
                                            {!hasPlaytested && (
                                                <Alert
                                                    color="warning"
                                                    icon={<FontAwesomeIcon icon={faFlask} className="text-2xl" />}
                                                    title="Untested Review"
                                                    classNames={{
                                                        title: "font-cinzel font-semibold text-sm md:text-md lg:text-lg"
                                                    }}
                                                >
                                                    <div className="text-xs md:text-sm lg:text-md italic">
                                                        Thank you for sharing your thoughts — since this verdict isn't
                                                        backed by actual playtesting, it may carry less weight than
                                                        reviews from those who have put the card through its paces.
                                                    </div>
                                                </Alert>
                                            )}
                                        </div>
                                        {hasPlaytested && (
                                            <>
                                                <div className="flex flex-col w-full">
                                                    <div className="text-base md:text-lg font-cinzel">
                                                        How many games have you played with this card?
                                                    </div>
                                                    <NumberInput
                                                        name="played"
                                                        value={review.played ?? 0}
                                                        onValueChange={(played) =>
                                                            setReview((prev) => ({ ...prev, played }))
                                                        }
                                                        minValue={1}
                                                        maxValue={999}
                                                        placeholder="Test"
                                                        size="lg"
                                                        classNames={{
                                                            mainWrapper: "max-w-24",
                                                            inputWrapper: "h-10",
                                                            input: "text-2xl"
                                                        }}
                                                    />
                                                </div>
                                                <SubmitDecks
                                                    decks={review?.decks}
                                                    card={card}
                                                    onValueChange={(decks) => setReview((prev) => ({ ...prev, decks }))}
                                                />
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1 p-2 w-full">
                                    <SectionTitle>Review Questions</SectionTitle>
                                    <div className="font-sans">
                                        Respond to the following questions in how much you agree (
                                        <StatementAnswerIcon answer="somewhat agree" />) or disagree (
                                        <StatementAnswerIcon answer="somewhat disagree" />
                                        ).
                                    </div>
                                    <div className="space-y-1">
                                        <StatementQuestion
                                            name="statements.boring"
                                            statement="Is it boring?"
                                            answer={review.statements?.boring}
                                            onValueChange={(boring) =>
                                                setReview((prev) => ({
                                                    ...prev,
                                                    statements: { ...prev.statements, boring }
                                                }))
                                            }
                                        />
                                        <StatementQuestion
                                            name="statements.competitive"
                                            statement="Will it see competitive play?"
                                            answer={review.statements?.competitive}
                                            onValueChange={(competitive) =>
                                                setReview((prev) => ({
                                                    ...prev,
                                                    statements: { ...prev.statements, competitive }
                                                }))
                                            }
                                        />
                                        <StatementQuestion
                                            name="statements.creative"
                                            statement="Does it encourage creativity?"
                                            answer={review.statements?.creative}
                                            onValueChange={(creative) =>
                                                setReview((prev) => ({
                                                    ...prev,
                                                    statements: { ...prev.statements, creative }
                                                }))
                                            }
                                        />
                                        <StatementQuestion
                                            name="statements.balanced"
                                            statement="Is it balanced?"
                                            answer={review.statements?.balanced}
                                            onValueChange={(balanced) =>
                                                setReview((prev) => ({
                                                    ...prev,
                                                    statements: { ...prev.statements, balanced }
                                                }))
                                            }
                                        />
                                        <StatementQuestion
                                            name="statements.releasable"
                                            statement="Could it be released as is?"
                                            answer={review.statements?.releasable}
                                            onValueChange={(releasable) =>
                                                setReview((prev) => ({
                                                    ...prev,
                                                    statements: { ...prev.statements, releasable }
                                                }))
                                            }
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1 p-2 w-full">
                                    <SectionTitle>Additional Comments</SectionTitle>
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
                            </>
                        )}
                        <ReviewFormActions
                            isNew={isNew}
                            canDelete={canDelete}
                            isCreating={isCreating}
                            isUpdating={isUpdating}
                            isDeleting={isDeleting}
                            isReviewDirty={isReviewDirty}
                            cardName={card?.name ?? "this card"}
                            onDelete={onDelete}
                        />
                    </WizardPage>
                </WizardPages>
            </Wizard>
        </div>
    );
}

type ReviewFormProps = {
    review?: DeepPartial<IPlaytestReview>;
    card?: IPlaytestCard;
    reviewer?: string;
};

// Rendered inside the Wizard, so it can reach onPageBack from context directly - a delete needs to
// animate the wizard back to page 1, which only a descendant of <Wizard> can drive
function ReviewFormActions({
    isNew,
    canDelete,
    isCreating,
    isUpdating,
    isDeleting,
    isReviewDirty,
    cardName,
    onDelete
}: ReviewFormActionsProps) {
    const { onPageBack } = useWizard();
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const handleDelete = async () => {
        if (await onDelete()) {
            setIsDeleteModalOpen(false);
            onPageBack();
        }
    };

    return (
        <>
            <div className="flex gap-2 justify-end w-full">
                {!isNew && canDelete && (
                    <Button
                        color="danger"
                        variant="flat"
                        isDisabled={isCreating || isUpdating || isDeleting}
                        onPress={() => setIsDeleteModalOpen(true)}
                    >
                        Delete Review
                    </Button>
                )}
                <Button
                    type="submit"
                    color="primary"
                    isLoading={isCreating || isUpdating}
                    isDisabled={isDeleting || !isReviewDirty}
                >
                    {isNew ? "Submit Review" : "Update Review"}
                </Button>
            </div>
            {!isNew && (
                <ConfirmDeleteReviewModal
                    isOpen={isDeleteModalOpen}
                    cardName={cardName}
                    isDeleting={isDeleting}
                    onConfirm={handleDelete}
                    onCancel={() => setIsDeleteModalOpen(false)}
                />
            )}
        </>
    );
}

type ReviewFormActionsProps = {
    isNew: boolean;
    canDelete: boolean;
    isCreating: boolean;
    isUpdating: boolean;
    isDeleting: boolean;
    isReviewDirty: boolean;
    cardName: string;
    onDelete: () => Promise<boolean>;
};
