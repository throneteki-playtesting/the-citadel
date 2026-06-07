import { Accordion, AccordionItem, Alert, Avatar, Button, ButtonGroup, Card, Link, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ScrollShadow, Select, SelectItem, SharedSelection, Skeleton } from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Faction, ILabeledCard } from "common/models/cards";
import { extractDeckIdentifier, hasPermission, SemanticVersion } from "common/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faExternalLink, faHandBackFist, faLightbulb, faMeh, faPencil, faScaleBalanced, faScroll, faThumbsDown, faThumbsUp, faTrophy } from "@fortawesome/free-solid-svg-icons";
import { DeckLink, DecklistLink } from "common/types";
import { IPlaytestReview, StatementAnswer, statementAnswers, StatementQuestions, Statements } from "common/models/reviews";
import { useLazyGetTDBCardQuery, useLazyGetTDBDeckQuery } from "../../api/thronesdb";
import { BaseTickContentProps, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import ThronesIcon from "../../components/thronesIcon";
import { faDiscord, IconDefinition } from "@fortawesome/free-brands-svg-icons";
import PermissionGate from "../../components/permissionGate";
import Permission from "common/models/permissions";
import { useNavigate } from "react-router-dom";
import { useGetReviewsQuery, useGetCardsQuery, useGetCardQuery, useGetUserQuery } from "../../api";
import { TouchTooltip } from "../../components/touchTooltip";
import { BaseElementProps } from "../../types";
import classNames from "classnames";
import Timestamp from "../../components/timestamp";
import LoadingCard from "../../components/loadingCard";
import { highlightTarget } from "../../constants";
import { HighlightTarget } from "../../components/highlightTarget";

const iconMap: Record<keyof Statements, IconDefinition> = {
    boring: faMeh,
    releasable: faCircleCheck,
    competitive: faTrophy,
    balanced: faScaleBalanced,
    creative: faLightbulb
};

export default function FeedbackStatistics({ className, style, project, number }: ReviewsSectionProps) {
    const { data: reviewsData, isLoading: isLoadingReviews } = useGetReviewsQuery({ filter: { project, number }, orderBy: { version: "desc", updated: "desc" } });
    const { data: cardsData, isLoading: isLoadingCards } = useGetCardsQuery({ filter: { project, number } });
    const [dataSets, setDataSets] = useState<SharedSelection>("all");
    const dataSetOptions = useMemo(() => cardsData?.items.map((card) => ({ key: card.version, value: `Version ${card.version}` })) ?? [], [cardsData?.items]);
    const dataSetReviews = useMemo(() => (dataSets === "all" ? reviewsData?.items : reviewsData?.items.filter((review) => dataSets.has(review.version))) ?? [], [dataSets, reviewsData?.items]);

    const isLoading = isLoadingReviews || isLoadingCards;

    const navigate = useNavigate();

    if (isLoading) {
        return (
            <div className={classNames("flex flex-col md:flex-row gap-2", className)} style={style}>
                <div className="flex flex-col items-center gap-2">
                    <Skeleton className="w-full h-10 rounded-xl"/>
                    <Skeleton className="w-full h-72 rounded-xl"/>
                </div>
                <div className="grow space-y-2">
                    <Skeleton className="w-full h-32 rounded-xl"/>
                    <Skeleton className="w-full h-32 rounded-xl"/>
                </div>
            </div>
        );
    }
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-4 w-full">
                <div className="h-px w-2 bg-primary/30" />
                <span className="font-cinzel text-base uppercase tracking-widest text-primary">Feedback & Statistics</span>
                <div className="h-px flex-1 bg-primary/30" />
            </div>
            {reviewsData && reviewsData.total === 0 ? (
                <div className="p-4 bg-content1 border border-content3 flex-shrink-0">
                    <div className="text-2xl font-cinzel"><FontAwesomeIcon icon={faScroll} /> No maester has rendered a verdict...</div>
                    <PermissionGate requires={Permission.MAKE_REVIEWS}>
                        <div className="text-sm font-sans">The Citadel awaits the first review for this card — submit your verdict to begin the chain.</div>
                        <div className="pt-2 flex justify-center w-full">
                            <Button color="primary" onPress={() => navigate(`/review/submit?project=${project}&number=${number}`)}>
                                Render your verdict!
                            </Button>
                        </div>
                    </PermissionGate>
                </div>
            ) : (
                <>
                    <div className="flex flex-col md:flex-row gap-1">
                        <div className="min-w-64">
                            <Select
                                label="Filter records for..."
                                selectionMode="multiple"
                                selectedKeys={dataSets}
                                onSelectionChange={(keys) => setDataSets(new Set([...keys] as SemanticVersion[]))}
                                renderValue={(items) => {
                                    if (items.length === dataSetOptions.length) {
                                        return "All Versions";
                                    }
                                    return items.map((item) => item.textValue).join(", ");
                                }}
                                classNames={{ mainWrapper: "w-auto", value: "text-base font-cinzel" }}
                                disallowEmptySelection
                            >
                                {dataSetOptions.map(({ key, value }) => <SelectItem key={key} className="font-cinzel">{value}</SelectItem>)}
                            </Select>
                        </div>
                        <div className="flex-1 flex flex-wrap gap-2 px-6 py-2 items-center justify-between text-lg font-cinzel">
                            <div>{dataSetReviews.length} Playtesting Reviews</div>
                            <div>{dataSetReviews.reduce((total, review) => review.played + total, 0)} Games Played</div>
                            <div>{new Set(dataSetReviews.reduce<string[]>((total, review) => [...total, review.reviewer], [])).size} Playtesters Involved</div>
                        </div>
                    </div>
                    <div className={classNames("flex flex-col md:flex-row gap-2", className)} style={style}>
                        <ReviewGraph dataSet={dataSetReviews} />
                        <ReviewSummaries project={project} number={number} dataSet={dataSetReviews} className="flex-1" />
                    </div>
                </>
            )}
        </div>
    );
};

type ReviewsSectionProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
}

function ReviewGraph({ className, style, dataSet }: ReviewGraphProps) {
    const radarData = useMemo(() => {
        const all = (dataSet).reduce<{ [s in keyof Statements]: number[] }>((avg, review) => {
            avg.boring.push(statementAnswers.indexOf(review.statements.boring.toLowerCase()));
            avg.competitive.push(statementAnswers.indexOf(review.statements.competitive.toLowerCase()));
            avg.creative.push(statementAnswers.indexOf(review.statements.creative.toLowerCase()));
            avg.balanced.push(statementAnswers.indexOf(review.statements.balanced.toLowerCase()));
            avg.releasable.push(statementAnswers.indexOf(review.statements.releasable.toLowerCase()));
            return avg;
        }, {
            boring: [],
            competitive: [],
            creative: [],
            balanced: [],
            releasable: []
        });

        const data: { key: keyof Statements, question: string, average: number }[] = [];
        for (const [questionKey, answers] of Object.entries(all)) {
            const key = questionKey as keyof Statements;
            data.push({ key, question: StatementQuestions[key], average: answers.length > 0 ? answers.reduce((a, b) => a + b) / answers.length : 0 });
        }
        return data;
    }, [dataSet]);

    const iconOffset = 10;
    const RenderCustomAxisTick: React.FC<BaseTickContentProps & { cx?: number; cy?: number, offset: number }> = ({
        x, y, payload, cx, cy, offset
    }) => {
        const icon = iconMap[payload.value as keyof Statements];

        const dx = (x as number) - (cx ?? 0);
        const dy = (y as number) - (cy ?? 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        const finalX = (x as number) + (dx / dist) * offset - 16;
        const finalY = (y as number) + (dy / dist) * offset - 16;

        return (
            <g transform={`translate(${finalX},${finalY})`}>
                <foreignObject width="32" height="32">
                    <div className="flex justify-center items-center w-full h-full">
                        <TouchTooltip content={<span className="capitalize">{payload.value}</span>}>
                            <FontAwesomeIcon icon={icon} className="text-white text-2xl" />
                        </TouchTooltip>
                    </div>
                </foreignObject>
            </g>
        );
    };
    const marginValue = iconOffset + 12;

    return (
        <div className={classNames("size-72 mx-auto", className)} style={style}>
            <ResponsiveContainer>
                <RadarChart data={radarData} margin={{ top: marginValue, right: marginValue, bottom: marginValue, left: marginValue }}>
                    <PolarGrid />
                    <PolarAngleAxis className="capitalize" dataKey="key" tick={(props) => <RenderCustomAxisTick offset={iconOffset} {...props} />} />
                    <Radar
                        name="Review Averages"
                        dataKey="average"
                        stroke="#8884d8"
                        fill="#8884d8"
                        fillOpacity={0.6}
                    />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
}

type ReviewGraphProps = Omit<BaseElementProps, "children"> & {
    dataSet: IPlaytestReview[]
}

function ReviewSummaries({ className, style, project, number, dataSet }: ReviewSummariesProps) {
    const [isOutdatedModalOpen, setIsOutdatedModalOpen] = useState(false);
    const navigate = useNavigate();

    const onEdit = useCallback((isLatest: boolean) => {
        if (isLatest) {
            navigate(`/review/submit?project=${project}&number=${number}`);
        } else {
            setIsOutdatedModalOpen(true);
        }
    }, [navigate, number, project]);

    return (
        <>
            <div className={classNames("space-y-2", className)} style={style}>
                <PermissionGate requires={Permission.MAKE_REVIEWS}>
                    <div className="pt-2 flex justify-center md:justify-end">
                        <Button className="text-lg" color="primary" onPress={() => navigate(`/review/submit?project=${project}&number=${number}`)}>
                                Submit a review
                        </Button>
                    </div>
                </PermissionGate>
                <ScrollShadow className="max-h-[50rem] flex flex-col border border-content3 divide-y divide-content3">
                    {dataSet?.map((review) => <ReviewSummary key={`${review.reviewer}|${review.version}`} review={review} onEdit={onEdit} />)}
                </ScrollShadow>
            </div>
            <Modal isOpen={isOutdatedModalOpen} onOpenChange={setIsOutdatedModalOpen} placement="center">
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="font-cinzel text-xl"><span><FontAwesomeIcon icon={faScroll}/> This scroll is sealed</span></ModalHeader>
                            <ModalBody>
                                <p className="font-sans text-base">
                                    Your review was submitted for an older version of this card. To provide feedback on the current version, you must submit a new review.
                                </p>
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="light" onPress={onClose}>
                                    Return
                                </Button>
                                <Button color="primary" onPress={() => {
                                    onClose();
                                    navigate(`/review/submit?project=${project}&number=${number}`);
                                }}>
                                    Submit a new review
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </>
    );
};

type ReviewSummariesProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
    dataSet?: IPlaytestReview[]
}


function statementAnswerIcon(answer: StatementAnswer) {
    switch (answer) {
        case "strongly disagree":
            return <TouchTooltip content="Strongly Disagree">
                <span><FontAwesomeIcon icon={faThumbsDown} className="text-statement-1"/><FontAwesomeIcon icon={faThumbsDown} className="text-statement-1"/></span>
            </TouchTooltip>;
        case "somewhat disagree":
            return <TouchTooltip content="Somewhat Disagree">
                <span><FontAwesomeIcon icon={faThumbsDown} className="text-statement-2"/></span>
            </TouchTooltip>;
        case "neither agree nor disagree":
            return <TouchTooltip content="Neither Agree/Disagree">
                <span><FontAwesomeIcon icon={faHandBackFist} className="text-statement-3"/></span>
            </TouchTooltip>;
        case "somewhat agree":
            return <TouchTooltip content="Somewhat Agree">
                <span><FontAwesomeIcon icon={faThumbsUp} className="text-statement-4"/></span>
            </TouchTooltip>;
        case "strongly agree":
            return <TouchTooltip content="Strongly Agree">
                <span><FontAwesomeIcon icon={faThumbsUp} className="text-statement-5"/><FontAwesomeIcon icon={faThumbsUp} className="text-statement-5"/></span>
            </TouchTooltip>;
    }
};
function ReviewSummary({ className, style, review, onEdit }: ReviewSummaryProps) {
    const { data: user, isLoading: isUserLoading } = useGetUserQuery({ discordId: review.reviewer });
    const { data: card, isLoading: isCardLoading } = useGetCardQuery({ project: review.project, number: review.number, version: review.version });

    const additionalRef = useRef<HTMLDivElement>(null);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    const isLoading = isUserLoading || isCardLoading;

    useEffect(() => {
        if (additionalRef.current) {
            setIsOverflowing(additionalRef.current.scrollHeight > additionalRef.current.clientHeight);
        }
    }, [review.additional, isLoading]);

    if (isLoading) {
        return (
            <div className={classNames("p-2 flex flex-col", className)} style={style}>
                <Skeleton className="w-64 h-8 rounded-md" />
                <div className="flex gap-2">
                    <div className="flex gap-2 items-center">
                        <Skeleton className="size-12 rounded-full" />
                        <div className="flex flex-col py-2 gap-2">
                            <Skeleton className="w-42 h-6 rounded-md" />
                            <Skeleton className="w-24 h-6 rounded-md" />
                        </div>
                    </div>
                </div>
                <div className="flex divide-x divide-content3 py-2">
                    <div className="shrink-0 flex flex-col gap-1 text-sm px-2">
                        <Skeleton className="w-28 h-6 rounded-md" />
                        <Skeleton className="w-28 h-6 rounded-md" />
                        <Skeleton className="w-28 h-6 rounded-md" />
                        <Skeleton className="w-28 h-6 rounded-md" />
                        <Skeleton className="w-28 h-6 rounded-md" />
                    </div>
                    <div className="px-2 py-1 space-y-1">
                        <Skeleton className="w-38 h-6 rounded-md" />
                        <Skeleton className="w-32 h-6 rounded-md" />
                        <Skeleton className="w-42 h-6 rounded-md" />
                        <Skeleton className="w-12 h-6 rounded-md" />
                    </div>
                </div>
            </div>
        );
    }

    if (!card) {
        return (
            <Alert color="danger">
                <div className="hidden">{`Project: ${review.project}, Number: ${review.number}, Version: ${review.version}, Reviewer: ${review.reviewer}`}</div>
                <div className="text-sm">Failed to load review. Please alert an administrator.</div>
            </Alert>
        );
    }

    return (
        <HighlightTarget targetId={highlightTarget.review(review)} className={classNames("bg-content1 p-4 flex flex-col ", className)} style={style}>
            <div className="flex gap-2 items-center">
                <div className="flex-1 text-lg font-cinzel text-foreground truncate">{card.name} <span className="text-foreground/50">{card.version}</span></div>
                <Timestamp className="my-auto text-xs italic text-foreground/40" date={new Date(review.updated)} />
                <div>
                    <ButtonGroup size="sm">
                        <PermissionGate requires={(user) => hasPermission(user, Permission.MAKE_REVIEWS) && user.discordId === review.reviewer}>
                            <TouchTooltip content={
                                <div className="max-w-64">
                                    <div className="text-sm">Amend your verdict</div>
                                    <div className="text-xs">Reviews may only be amended for the current version of the card.</div>
                                </div>
                            }>
                                <Button
                                    isIconOnly
                                    onPress={() => onEdit(card.latest)}
                                    color="primary"
                                >
                                    <FontAwesomeIcon icon={faPencil}/>
                                </Button>
                            </TouchTooltip>
                        </PermissionGate>
                        <TouchTooltip content={
                            <div className="max-w-64">
                                <div className="text-sm">Join the discussion</div>
                                <div className="text-xs">You will be redirected to discord.</div>
                            </div>
                        }>
                            <Button
                                as={Link}
                                isIconOnly
                                isDisabled={!review.discord?.messageUrl}
                                href={review.discord?.messageUrl?.replace("https://", "discord://")}
                                target="_blank"
                            >
                                {/* TODO: Change this to sync if messageUrl is null, assuming permission */}
                                <FontAwesomeIcon icon={faDiscord}/>
                            </Button>
                        </TouchTooltip>
                    </ButtonGroup>
                </div>
            </div>
            <div className="flex gap-2">
                <div className="flex gap-2 items-center">
                    <Avatar src={user?.avatarUrl} name={user?.displayname ?? "?"} classNames={{ name: "text-2xl" }}className="shrink-0 size-12"/>
                    <div className="flex flex-col min-w-0">
                        <div className="text-lg font-crimson italic">
                                Review by {user?.displayname ?? "Unknown Playtester"}
                        </div>
                        <div className="text-base font-crimson italic truncate text-foreground/40">
                            {review.played} {review.played !== 1 ? "games" : "game"} played
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex flex-col sm:flex-row max-sm:divide-y sm:divide-x divide-content3 py-2">
                <div className="shrink-0 flex flex-wrap sm:flex-col gap-2 text-sm px-2 pb-2">
                    <span>Boring: {statementAnswerIcon(review.statements.boring)}</span>
                    <span>Competitive: {statementAnswerIcon(review.statements.competitive)}</span>
                    <span>Creative: {statementAnswerIcon(review.statements.creative)}</span>
                    <span>Balanced: {statementAnswerIcon(review.statements.balanced)}</span>
                    <span>Releasable: {statementAnswerIcon(review.statements.releasable)}</span>
                </div>
                <div className="px-2 py-1">
                    <div className="font-crimson italic text-lg">Additional Comments</div>
                    <div className="relative">
                        <div
                            ref={additionalRef}
                            className="text-sm leading-tight whitespace-pre-wrap overflow-hidden transition-all duration-300"
                            style={{ maxHeight: isExpanded ? additionalRef.current?.scrollHeight : "8rem" }}
                        >
                            {review.additional ?? "No comments provided."}
                        </div>
                        {!isExpanded && isOverflowing && (
                            <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-content1 to-transparent pointer-events-none" />
                        )}
                    </div>
                    {isOverflowing && (
                        <button className="text-xs text-foreground/50 hover:text-default-600 mt-1" onClick={() => setIsExpanded((prev) => !prev)}>
                            {isExpanded ? "Show less" : "Read more..."}
                        </button>
                    )}
                </div>
            </div>
            <Accordion>
                <AccordionItem title={<span className="font-crimson italic text-lg">Submitted Decks</span>} classNames={{ trigger: "py-1" }} textValue="View Submitted Decks" keepContentMounted>
                    <div className="overflow-hidden min-w-0">
                        {review.decks.map((deck) => <ReviewSummaryDeck key={deck} url={deck} className="p-1" />)}
                    </div>
                </AccordionItem>
            </Accordion>
        </HighlightTarget>
    );
}

type ReviewSummaryProps = Omit<BaseElementProps, "children"> & {
    review: IPlaytestReview;
    onEdit: (isLatest: boolean) => void;
}

function ReviewSummaryDeck({ className, style, url }: ReviewSummaryDeckProps) {
    const [fetchDeck] = useLazyGetTDBDeckQuery();
    const [fetchCard, { isFetching: isCardLoading }] = useLazyGetTDBCardQuery();
    const [isLoading, setIsLoading] = useState(false);
    const [name, setName] = useState<string>();
    const [faction, setFaction] = useState<Faction>();
    const [agendas, setAgendas] = useState<ILabeledCard[]>();

    useEffect(() => {
        const loadDeck = async (url: DeckLink | DecklistLink) => {
            setIsLoading(true);
            try {
                const identifier = extractDeckIdentifier(url);
                if (!identifier) {
                    throw new Error("Deck Identifier could not be extracted");
                }
                const deck = await fetchDeck(identifier).unwrap();
                if (deck) {
                    setName(deck.name);
                    setFaction(deck.faction);
                    const agendas = await Promise.all(deck.agendas.map((agenda) => fetchCard(agenda).unwrap()));
                    setAgendas(agendas.reverse());
                }
            } catch {
                // Do nothing
            } finally {
                setIsLoading(false);
            }
        };

        loadDeck(url);
    }, [fetchCard, fetchDeck, url]);

    if (isLoading || isCardLoading) {
        return (
            <div className={classNames("flex gap-1 h-52 w-full", className)} style={style}>
                <LoadingCard />
                <div className="flex flex-col flex-2 space-y-2 p-2">
                    <Skeleton className="w-32 h-8 rounded-md"/>
                    <Skeleton className="h-12 rounded-md"/>
                    <Skeleton className="w-64 h-8 rounded-md"/>
                    <Skeleton className="w-32 h-8 rounded-md"/>
                </div>
            </div>
        );
    }

    if (!faction || !agendas) {
        return null;
    }

    return (
        <Link key={url} href={url} target="_blank" className={classNames("w-full", className)} style={style}>
            <Card className="p-2 w-full hover:ring-2 ring-content3 transition-shadow duration-200">
                <div className="flex flex-col flex-1 min-w-0">
                    <div className="w-full flex items-center gap-2 min-w-0">
                        <div className="font-cinzel text-lg truncate flex-1">{name}</div>
                        <FontAwesomeIcon icon={faExternalLink} className="shrink-0" />
                    </div>
                    <div className="text-xl">
                        <span><ThronesIcon name={faction} className="text-2xl"/> {agendas.map((agenda) => agenda.name).join(", ")}</span>
                    </div>
                </div>
            </Card>
        </Link>
    );
}

type ReviewSummaryDeckProps = Omit<BaseElementProps, "children"> & {
    url: DeckLink | DecklistLink
}
