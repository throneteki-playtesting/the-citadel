import { Accordion, AccordionItem, addToast, Alert, BreadcrumbItem, Breadcrumbs, Button, Card, Divider, Link, ScrollShadow, Select, SelectItem, SharedSelection, Skeleton, Tab, Tabs, Tooltip, User } from "@heroui/react";
import { BaseElementProps } from "../../types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useGetCardsQuery, useGetProjectQuery, useGetReviewsQuery } from "../../api";
import { Code, ILabeledCard, IPlaytestCard } from "common/models/cards";
import { cloneDeep, sortBy } from "lodash";
import { CardPreview } from "@agot/card-preview";
import { extractDeckIdentifier, hasPermission, parseCardCode, renderPlaytestingCard, SemanticVersion } from "common/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAngleLeft, faAngleRight, faCircleCheck, faExclamationTriangle, faExternalLink, faHandFist, faLightbulb, faMeh, faPencil, faPenToSquare, faPlayCircle, faScaleBalanced, faStar, faThumbsDown, faThumbsUp, faTrash, faTrophy, faUser, faWarning, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { DeckLink, DecklistLink } from "common/types";
import { gt } from "semver";
import { IPlaytestReview, StatementAnswer, statementAnswers, StatementQuestions, Statements } from "common/models/reviews";
import { useGetDeckQuery, useLazyGetCardQuery, useLazyGetDeckQuery } from "../../api/thronesdb";
import { IDecklist } from "common/models/decks";
import classNames from "classnames";
import CardImage from "../../components/cardImage";
import { useTimezone } from "../../api/hooks";
import EditCardModal from "./editCardModal";
import DeleteCardModal from "./deleteCardModal";
import LoadingCard from "../../components/loadingCard";
import { BaseTickContentProps, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import ThronesIcon from "../../components/thronesIcon";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import PermissionGate from "../../components/permissionGate";
import Permission from "common/models/permissions";
import { useNavigate } from "react-router-dom";
import { IProject } from "common/models/projects";
import { noteTypeIcon } from "../../utils";
import DevelopmentStatus from "../../components/status/developmentStatus";
import ImageStatus from "../../components/status/imageStatus";
import ImplementStatus from "../../components/status/implementStatus";
import DiscordCardStatus from "../../components/status/discordCardStatus";

const iconMap: Record<keyof Statements, IconDefinition> = {
    boring: faMeh,
    releasable: faCircleCheck,
    competitive: faTrophy,
    balanced: faScaleBalanced,
    creative: faLightbulb
};
const CardDetail = ({ className, style, project: projectNumber, number }: CardDetailProps) => {
    const { data: cardsData, isLoading: isCardsLoading } = useGetCardsQuery({ filter: { project: projectNumber, number } });
    const { data: project, isLoading: isProjectLoading } = useGetProjectQuery({ number: projectNumber });
    const { data: reviewsData, isLoading: isReviewsLoading } = useGetReviewsQuery({ filter: { project: projectNumber, number } });

    const { latest, draft, cards } = useMemo(() => {
        let latest = undefined;
        let draft = undefined;
        const cards: IPlaytestCard[] = [];

        for (const card of [...cardsData?.items ?? []].reverse()) {
            cards.push(card);
            if (!latest && card.latest) {
                latest = card;
            }
            if (!draft && card.draft) {
                draft = card;
            }
        }
        return { latest, draft, cards };
    }, [cardsData?.items]);


    return (
        <>
            <div className={className} style={style}>
                <Breadcrumbs size="lg" className="m-2">
                    <BreadcrumbItem href={`/project/${projectNumber}`}>
                        {isProjectLoading ? <Skeleton className="w-24 h-6 rounded-lg"/> : project?.name}
                    </BreadcrumbItem>
                    <BreadcrumbItem isCurrent>Slot #{number}</BreadcrumbItem>
                </Breadcrumbs>
                <div className="flex flex-col gap-2">
                    <div className="flex flex-col md:flex-row gap-2 w-full">
                        <Card className="w-full md:w-72 p-1 shrink-0">
                            <CardVersions isLoading={isCardsLoading} cards={cards}/>
                        </Card>
                        <div className="grow flex flex-col gap-2">
                            <Card className="p-2">
                                <HeadingCard isLoading={isCardsLoading || isProjectLoading} project={project} number={number} latest={latest} draft={draft}/>
                            </Card>
                            <Card className="p-2">
                                <DeckSummaries isLoading={isCardsLoading || isReviewsLoading} cards={cards} reviews={reviewsData?.items}/>
                            </Card>
                        </div>
                    </div>
                    <PermissionGate requires={Permission.READ_REVIEWS}>
                        <Card className="p-2">
                            <ReviewsSection project={projectNumber} number={number} isLoading={isReviewsLoading} cards={cards} reviews={reviewsData?.items}/>
                        </Card>
                    </PermissionGate>
                </div>
            </div>
        </>
    );
};

type CardDetailProps = Omit<BaseElementProps, "children"> & { project: number, number: number };

const CardVersions = ({ isLoading = false, cards }: CardVersionsProps) => {
    const { format } = useTimezone();
    if (isLoading) {
        return (
            <div className="flex flex-col gap-2">
                <div className="h-8 flex gap-1 m-1">
                    <Skeleton className="h-full w-20 rounded-lg"/>
                    <Skeleton className="h-full w-20 rounded-lg"/>
                    <Skeleton className="h-full w-20 rounded-lg"/>
                </div>
                <div className="p-2">
                    <LoadingCard />
                </div>
            </div>
        );
    }

    const released = cards.find((card) => card.latest && card.release);

    return (
        <Tabs aria-label="Card Versions" variant="underlined" color="primary" destroyInactiveTabPanel={false}>
            {released && (
                <Tab
                    key="release"
                    title={<span className="text-medium font-semibold">Release</span>}
                    className="flex flex-col items-center"
                >
                    <CardImage card={released} className={released.type === "plot" ? "max-w-98" : "max-w-64"}/>
                </Tab>
            )}
            {cards.map((card) => {
                let label: string = card.version;
                if (card.latest) {
                    label = "Latest";
                } else if (card.draft) {
                    label = "Draft";
                }
                return (
                    <Tab
                        key={card.version}
                        title={<span className="text-medium font-semibold">{label}</span>}
                        className="flex justify-center flex-wrap md:flex-col md:items-center md:flex-nowrap"
                    >
                        <CardPreview card={renderPlaytestingCard(card)} className={card.type === "plot" ? "max-w-98" : "max-w-64"}/>
                        {card.note && (
                            <div className="grow min-w-64">
                                <Accordion>
                                    <AccordionItem title={<span className="text-small italic">Expand for details</span>} textValue="Change Note" classNames={{ trigger: "pb-0" }}>
                                        <Divider className="mb-2"/>
                                        <div className="space-y-1">
                                            <Card className="p-2" radius="sm">
                                                <div className="text-small font-semibold capitalize"><FontAwesomeIcon icon={noteTypeIcon[card.note.type]}/> {card.note.type}</div>
                                                <div className="text-tiny italic p-1">{card.note.text}</div>
                                            </Card>
                                            <Card className="p-2" radius="sm">
                                                <div className="text-small">
                                                    <span><FontAwesomeIcon icon={faPenToSquare}/> {format(new Date(card.updated))}</span>
                                                </div>
                                            </Card>
                                        </div>
                                    </AccordionItem>
                                </Accordion>
                            </div>
                        )}
                    </Tab>
                );
            })}
        </Tabs>
    );
};

type CardVersionsProps = { isLoading?: boolean, released?: IPlaytestCard, cards: IPlaytestCard[] }

const HeadingCard = ({ isLoading = false, project, number, draft, latest }: HeadingCardProps) => {
    const [editing, setEditing] = useState<IPlaytestCard>();
    const [deleting, setDeleting] = useState<IPlaytestCard>();
    const navigate = useNavigate();

    const onNewDraft = useCallback((latest: IPlaytestCard) => {
        const draft = cloneDeep(latest);
        delete draft.note;
        delete draft.github;
        delete draft.release;
        delete draft.discord;
        draft.latest = false;
        draft.implemented = false;
        setEditing(draft);
    }, []);

    const totalProjectCards = useMemo(() => project ? Object.values(project.cardCount).reduce((arr, num) => arr + num, 0) : 0, [project]);

    if (isLoading) {
        return (
            <div className="flex flex-col">
                <Skeleton className="w-full h-10 rounded-xl"/>
                <Divider className="mt-2"/>
                <div className="py-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                    <Skeleton className="w-full h-16 rounded-xl"/>
                    <Skeleton className="w-full h-16 rounded-xl"/>
                    <Skeleton className="w-full h-16 rounded-xl"/>
                </div>
            </div>
        );
    }

    return (
        <>
            { project && latest && (
                <div className="flex items-center text-large px-2">
                    {number > 1 && <Button isIconOnly variant="light" onPress={() => navigate(`/project/${project.number}/${--number}`)}><FontAwesomeIcon icon={faAngleLeft}/></Button>}
                    <div className="grow px-2">{project.name} #{parseCardCode(!!latest.release, project.number, number)}</div>
                    {number < totalProjectCards && <Button isIconOnly variant="light" onPress={() => navigate(`/project/${project.number}/${++number}`)}><FontAwesomeIcon icon={faAngleRight}/></Button>}
                </div>
            )}
            <Divider className="my-2"/>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1">
                {!latest?.release && (
                    <>
                        <PermissionGate requires={Permission.CREATE_CARDS}>
                            {!draft && latest && <Button onPress={() => onNewDraft(latest)} startContent={<FontAwesomeIcon icon={faStar} className="text-small md:text-medium"/>} className="text-small md:text-medium">New Draft</Button>}
                        </PermissionGate>
                        <PermissionGate requires={Permission.EDIT_CARDS}>
                            {draft && <Button onPress={() => setEditing(draft)} startContent={<FontAwesomeIcon icon={faPencil}/>} className="text-small md:text-medium">Edit Draft</Button>}
                        </PermissionGate>
                        <PermissionGate requires={Permission.DELETE_CARDS}>
                            {draft && <Button color="danger" onPress={() => setDeleting(draft)} startContent={<FontAwesomeIcon icon={faTrash} className="text-small md:text-medium"/>} className="text-small md:text-medium">Delete Draft</Button>}
                        </PermissionGate>
                    </>
                )}
                <PermissionGate requires={Permission.READ_DISCORD_CARD_FORUM}>
                    {latest?.discord?.messageUrl &&
                        <Button
                            as={Link}
                            href={latest.discord.messageUrl.replace("https://", "discord://")}
                            target="_blank"
                            startContent={<FontAwesomeIcon icon={faDiscord} className="text-small md:text-medium"/>}
                            className="text-small md:text-medium"
                        >
                            Join Discussion
                        </Button>
                    }
                </PermissionGate>
            </div>
            <StatusBoard latest={latest} draft={draft} />
            <EditCardModal isOpen={!!editing} card={editing} onClose={() => setEditing(undefined)} onSave={(card) => addToast({ title: "Successfully saved", color: "success", description: `'${card.name}' ver. ${card.version} has been ${draft ? "edited" : "created"}` })}/>
            <DeleteCardModal isOpen={!!deleting} card={deleting} onClose={() => setDeleting(undefined)} onDelete={(card) => addToast({ title: "Successfully deleted", color: "success", description: `'${card.name}' ver. ${card.version} has been deleted` })}/>
        </>
    );
};

type HeadingCardProps = { isLoading?: boolean, project?: IProject, number: number, draft?: IPlaytestCard, latest?: IPlaytestCard }

const StatusBoard = ({ latest, draft }: StatusBoardProps) => {
    return (
        <div className="py-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
            <DevelopmentStatus latest={latest} draft={draft}/>
            <ImplementStatus card={draft ?? latest}/>
            <PermissionGate requires={Permission.SYNC_CARD_IMAGES}>
                <ImageStatus card={draft ?? latest}/>
            </PermissionGate>
            <PermissionGate requires={Permission.SYNC_CARD_DISCORD}>
                <DiscordCardStatus card={draft ?? latest} />
            </PermissionGate>
        </div>
    );
};

type StatusBoardProps = { isLoading?: boolean, latest?: IPlaytestCard, draft?: IPlaytestCard };

const DeckSummaries = ({ isLoading = false, cards, reviews, safe = true }: DeckSummariesProps) => {
    const [fetchDeck] = useLazyGetDeckQuery();
    const [deckGroups, setDeckGroups] = useState<Map<DeckLink | DecklistLink, { review: IPlaytestReview, card: IPlaytestCard, deck: IDecklist}>>();
    const [loading, setLoading] = useState<(DeckLink | DecklistLink)[]>([]);
    const { format } = useTimezone();

    useEffect(() => {
        if (!reviews || reviews.length === 0) {
            return;
        }
        const loadDeck = async (review: IPlaytestReview, card: IPlaytestCard, url: DeckLink | DecklistLink) => {
            try {
                const identifier = extractDeckIdentifier(url);
                const deck = await fetchDeck(identifier).unwrap();

                const newDeckGroups = deckGroups ?? new Map();
                newDeckGroups.set(url, { review, card, deck });
                setDeckGroups(newDeckGroups);
            } catch (err) {
                if (!safe) {
                    throw err;
                }
            } finally {
                setLoading((prev) => prev.filter((loadingUrl) => loadingUrl !== url));
            }
        };

        const deckVersionMap = new Map<DeckLink | DecklistLink, { review: IPlaytestReview, card: IPlaytestCard }>();
        for (const review of reviews) {
            for (const deck of review.decks) {
                // If it doesnt already exist, or if this review is a later version
                const current = deckVersionMap.get(deck);
                if (!current || gt(review.version, current?.card.version)) {
                    const card = cards.find((card) => card.version === review.version);
                    if (!card) {
                        // Realistically this should never happen, but just in case for bugs
                        console.error(`Error fetching review for project ${review.project}, card ${review.number}, version ${review.version}: Cannot be found`);
                    } else {
                        deckVersionMap.set(deck, { card, review });
                    }
                }
            }
        }

        setLoading([...deckVersionMap.keys()]);
        for (const [deck, { card, review }] of [...deckVersionMap.entries()]) {
            loadDeck(review, card, deck);
        }
    }, [cards, deckGroups, fetchDeck, reviews, safe]);

    if (isLoading || (!deckGroups && loading.length > 0)) {
        return <Skeleton className="min-h-20 rounded-xl"/>;
    }
    if (!deckGroups) {
        return (
            <Alert className="min-h-20 max-h-20">
                <span>No decks available</span>
                <span className="text-tiny">Submit new decks via playtesting reviews.</span>
            </Alert>
        );
    }

    const sorted = sortBy(Array.from(deckGroups?.entries()), ([, { deck }]) => deck.updated).reverse();
    return (
        <ScrollShadow className="flex flex-col gap-1 min-h-20 max-h-98 p-1">
            {sorted.map(([url, { review, card, deck }]) => {
                const agendas = [...deck.agendas].reverse();
                const getColsClassName = (deck: IDecklist) => {
                    switch (deck.agendas.length) {
                        case 2:
                            return "grid-cols-3";
                        case 3:
                            return "grid-cols-4";
                        case 4:
                            return "grid-cols-5";
                        case 5:
                            return "grid-cols-6";
                        default:
                            return "grid-cols-2";
                    }
                };

                return (
                    <Link key={url} href={url} target="_blank">
                        <Card className="p-2 w-full">
                            <div className="flex gap-1">
                                <div className={classNames("grid gap-0.5 flex-1", getColsClassName(deck))}>
                                    <CardImage key={deck.faction} card={deck.faction} className="rounded-sm"/>
                                    {agendas.map((code) => <CardImage key={code} card={code} className="rounded-sm"/>)}
                                </div>
                                <div className="flex flex-col flex-2 px-1">
                                    <div className="text-small sm:text-medium lg:text-large font-semibold">
                                        <span>{deck.name}</span> <span className="text-gray-500 text-tiny">{deck.version}</span>
                                    </div>
                                    <div className="grow italic text-small sm:text-medium lg:text-large flex items-center">
                                        <Tooltip isDisabled={card.latest} content={`This deck was submitted for v${card.version} and may not align with latest version`} offset={-2}>
                                            <div>{!card.latest && <FontAwesomeIcon icon={faExclamationTriangle} className="text-orange-400 animate-pulse"/>}<span> {card.name} v{card.version}</span></div>
                                        </Tooltip>
                                    </div>
                                    <div className="italic text-tiny sm:text-small lg:text-medium text-gray-500">
                                        <FontAwesomeIcon icon={faUser}/> {review.reviewer}
                                    </div>
                                    <div className="italic text-tiny sm:text-small lg:text-medium text-gray-500">
                                        <FontAwesomeIcon icon={faPenToSquare}/> {format(new Date(deck.updated))}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </Link>
                );
            })}
        </ScrollShadow>
    );
};

type DeckSummariesProps = { isLoading?: boolean, cards: IPlaytestCard[], reviews?: IPlaytestReview[], safe?: boolean }

const ReviewsSection = ({ project, number, isLoading = false, cards, reviews }: ReviewsSectionProps) => {
    const [dataSets, setDataSets] = useState<SharedSelection>("all");
    const dataSetOptions = useMemo(() => cards?.map((card) => ({ key: card.version, value: `v${card.version}` })) ?? [], [cards]);
    const dataSetReviews = useMemo(() => (dataSets === "all" ? reviews : reviews?.filter((review) => dataSets.has(review.version))) ?? [], [dataSets, reviews]);

    const radarData = useMemo(() => {
        const dataSet = dataSetReviews;
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
    }, [dataSetReviews]);

    if (isLoading) {
        return (
            <div className="flex flex-col md:flex-row gap-4">
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
                        <Tooltip content={<span className="capitalize">{payload.value}</span>}>
                            <FontAwesomeIcon icon={icon} className="text-white text-2xl" />
                        </Tooltip>
                    </div>
                </foreignObject>
            </g>
        );
    };
    const marginValue = iconOffset + 12;
    return (
        <div className="flex flex-col md:flex-row gap-2">
            <div className="flex flex-col items-center">
                <Select
                    selectionMode="multiple"
                    selectedKeys={dataSets}
                    onSelectionChange={(keys) => setDataSets(new Set([...keys] as SemanticVersion[]))}
                    renderValue={(items) => {
                        if (items.length === dataSetOptions.length) {
                            return "All Versions";
                        }
                        return items.map((item) => item.textValue).join(", ");
                    }}
                    classNames={{ value: "text-medium sm:text-large lg:text-xl" }}
                >
                    {dataSetOptions.map(({ key, value }) => <SelectItem key={key}>{value}</SelectItem>)}
                </Select>
                <div className="flex items-center justify-items-center flex-wrap md:flex-col gap-2">
                    <div className="size-72 m-auto">
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
                    <Card className="p-2 md:w-full grow" radius="none">
                        <span className="text-small sm:text-medium lg:text-large py-1 lg:py-2">{dataSetReviews.length} Reviews</span>
                        <Divider/>
                        <span className="text-small sm:text-medium lg:text-large py-1 lg:py-2">{dataSetReviews.reduce((total, review) => review.played + total, 0)} Games Played</span>
                        <Divider/>
                        <span className="text-small sm:text-medium lg:text-large py-1 lg:py-2">{new Set(dataSetReviews.reduce<string[]>((total, review) => [...total, review.reviewer], [])).size} Playtesters</span>
                        <Divider/>
                        <span className="text-small sm:text-medium lg:text-large py-1 lg:py-2 italic">Win Rate coming soon</span>
                    </Card>
                </div>
            </div>
            <div className="grow">
                <ReviewSummaries project={project} number={number} reviews={dataSetReviews} cards={cards} />
            </div>
        </div>
    );
};

type ReviewsSectionProps = { project: number, number: number, isLoading?: boolean, cards?: IPlaytestCard[], reviews?: IPlaytestReview[] }

const ReviewSummaries = ({ project, number, reviews, cards }: ReviewSummariesProps) => {
    const { format } = useTimezone();
    const navigate = useNavigate();

    const answerIcon = (answer: StatementAnswer) => {
        switch (answer) {
            case "strongly disagree":
                return <FontAwesomeIcon icon={faThumbsDown} className="text-statement-1"/>;
            case "somewhat disagree":
                return <FontAwesomeIcon icon={faThumbsDown} className="text-statement-2"/>;
            case "neither agree nor disagree":
                return <FontAwesomeIcon icon={faHandFist} className="text-statement-3"/>;
            case "somewhat agree":
                return <FontAwesomeIcon icon={faThumbsUp} className="text-statement-4"/>;
            case "strongly agree":
                return <FontAwesomeIcon icon={faThumbsUp} className="text-statement-5"/>;
        }
    };

    if (!reviews || reviews.length === 0) {
        return (
            <Alert className="min-h-30 max-h-30">
                <span>No reviews available</span>
                <Button className="mt-1" variant="ghost" onPress={() => navigate(`/review/submit?project=${project}&number=${number}`)}>Click here to review this card!</Button>
            </Alert>
        );
    }

    return (
        <ScrollShadow className="flex flex-col gap-1 sm:gap-2 min-h-20 max-h-[50rem] p-1">
            {reviews?.map((review) => {
                const key = `${review.project}|${review.number}${review.version}|${review.reviewer}`;
                const card = cards?.find((card) => card.version === review.version);
                if (!card) {
                    return <div key={key}/>;
                }
                return (
                    <Card key={key} className="p-2 min-h-fit h-32">
                        <div className="flex flex-col lg:flex-row lg:gap-2 px-2">
                            <div className="italic text-medium sm:text-large lg:text-xl">{card.name} v{card.version}</div>
                            <User
                                name={review.reviewer}
                                className="justify-start lg:ml-auto gap-1"
                                classNames={{ name: "text-medium sm:text-large lg:text-xl italic text-gray-400" }}
                                avatarProps={{ classNames: { base: "size-4" }, src: "" /* TODO: IMPLEMENT USER FETCHING*/ }}
                            />
                        </div>
                        <Divider className="my-2"/>
                        <div className="flex">
                            <div className="max-w-fit px-1 flex flex-col flex-1 border-r-1 border-default-200">
                                <div className="text-small sm:text-medium">
                                    <FontAwesomeIcon icon={iconMap.boring}/> <span>Boring:</span> <span className="capitalize">{answerIcon(review.statements.boring)}</span>
                                </div>
                                <div className="text-small sm:text-medium">
                                    <FontAwesomeIcon icon={iconMap.competitive}/> <span>Competitive:</span> <span className="capitalize">{answerIcon(review.statements.competitive)}</span>
                                </div>
                                <div className="text-small sm:text-medium">
                                    <FontAwesomeIcon icon={iconMap.creative}/> <span>Creative:</span> <span className="capitalize">{answerIcon(review.statements.creative)}</span>
                                </div>
                                <div className="text-small sm:text-medium">
                                    <FontAwesomeIcon icon={iconMap.balanced}/> <span>Balanced:</span> <span className="capitalize">{answerIcon(review.statements.balanced)}</span>
                                </div>
                                <div className="text-small sm:text-medium">
                                    <FontAwesomeIcon icon={iconMap.releasable}/> <span>Releasable:</span> <span className="capitalize">{answerIcon(review.statements.releasable)}</span>
                                </div>
                            </div>
                            <div className="flex flex-col flex-1 gap-0.5 px-2 min-w-0 justify-evenly">
                                <div className="italic text-small sm:text-medium text-gray-500">
                                    <FontAwesomeIcon icon={faPlayCircle}/> {review.played} Games Played
                                </div>
                                <Divider />
                                <div className="italic text-small sm:text-medium text-gray-500 flex flex-col">
                                    {review.decks.map((deck) => <ReviewSummaryDeck key={deck} src={deck}/>)}
                                </div>
                                <Divider />
                                <div className="italic text-small sm:text-medium text-gray-500">
                                    <FontAwesomeIcon icon={faPenToSquare}/> {format(new Date(review.updated))}
                                </div>
                                <Divider />
                                <div className="pt-1 flex flex-wrap">
                                    <PermissionGate requires={(user) => hasPermission(user, Permission.MAKE_REVIEWS) && user.discordId === review.reviewer}>
                                        <Button onPress={() => navigate(`/review/submit?project=${card.project}&number=${card.number}`)} variant="light" className="px-unit-0 sm:px-unit-4 min-w-10 sm:min-w-24">
                                            <FontAwesomeIcon icon={card.latest ? faPencil : faStar}/>
                                            <span className="hidden sm:inline">{card.latest ? "Edit" : "Submit New"}</span>
                                        </Button>
                                    </PermissionGate>
                                    <Button
                                        as={Link}
                                        variant="light"
                                        isDisabled={!review.discord?.messageUrl}
                                        href={review.discord?.messageUrl?.replace("https://", "discord://")}
                                        target="_blank"
                                        className="px-unit-0 sm:px-unit-4 min-w-10 sm:min-w-24"
                                    >
                                        <FontAwesomeIcon icon={faDiscord}/>
                                        <span className="hidden sm:inline">Join Discussion</span>
                                    </Button>
                                </div>
                            </div>
                        </div>
                        {review.additional && (
                            <>
                                <Divider className="my-2"/>
                                <Accordion>
                                    <AccordionItem title={<span className="text-small sm:text-medium lg:text-large italic text-gray-400">Additional comments</span>} classNames={{ trigger: "py-0" }} textValue="Additional comments">
                                        <div className="text-tiny sm:text-small">{review.additional}</div>
                                    </AccordionItem>
                                </Accordion>
                            </>
                        )}
                    </Card>
                );
            })}
        </ScrollShadow>
    );
};

type ReviewSummariesProps = { project: number, number: number, reviews?: IPlaytestReview[], cards?: IPlaytestCard[] }

const ReviewSummaryDeck = ({ src }: ReviewSummaryDeckProps) => {
    const { data: deck, isLoading: isDeckLoading } = useGetDeckQuery(extractDeckIdentifier(src));
    const [fetchCard, { isLoading: isCardLoading }] = useLazyGetCardQuery();
    const [primaryAgenda, setPrimaryAgenda] = useState<ILabeledCard | Code>();

    useEffect(() => {
        const loadAgenda = async (code: Code) => {
            try {
                const card = await fetchCard(code).unwrap();
                setPrimaryAgenda(card);
            } catch {
                setPrimaryAgenda(code);
            }
        };

        if (deck?.agendas[0]) {
            loadAgenda(deck?.agendas[0]);
        }
    }, [deck?.agendas, fetchCard]);

    const agenda = useMemo(() => {
        if (isCardLoading) {
            return <Skeleton className="min-w-22 min-h-4 lg:min-h-6 rounded-md"/>;
        }

        if (typeof primaryAgenda === "string") {
            return (
                <>
                    <FontAwesomeIcon icon={faWarning} className="text-orange-400 animate-pulse"/>
                    <span className="italic">{primaryAgenda}</span>
                </>
            );
        }

        return primaryAgenda?.name;
    }, [isCardLoading, primaryAgenda]);

    if (isDeckLoading) {
        return <Skeleton className="min-h-4 lg:min-h-6 rounded-md m-0.5"/>;
    }

    if (!deck) {
        return <span className="text-small sm:text-medium text-red-400"><FontAwesomeIcon icon={faWarning} className="animate-pulse"/> Deck missing</span>;
    }

    return (
        <Link className="flex items-center w-full gap-1 text-small sm:text-medium text-gray-500" href={src} target="_blank">
            <ThronesIcon name={deck.faction}/>
            <span className="truncate">{agenda}</span>
            <FontAwesomeIcon icon={faExternalLink}/>
        </Link>
    );
};

type ReviewSummaryDeckProps = { src: DeckLink | DecklistLink }

export default CardDetail;