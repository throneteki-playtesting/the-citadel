import { faExclamationCircle, faExternalLink, faScroll, faCheckCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Skeleton, ScrollShadow, Card, Link, Avatar } from "@heroui/react";
import { IPlaytestCard } from "common/models/cards";
import { IDecklist } from "common/models/decks";
import { IPlaytestReview } from "common/models/reviews";
import { DeckLink, DecklistLink } from "common/types";
import { extractDeckIdentifier } from "common/utils";
import { sortBy } from "lodash-es";
import { useState, useEffect, useMemo } from "react";
import { gt } from "semver";
import { useGetReviewsQuery, useGetCardsQuery, useGetUserQuery } from "../../api";
import { useLazyGetTDBDeckQuery } from "../../api/thronesdb";
import CardImage from "../../components/cardImage";
import CardStack from "../../components/cardStack";
import LoadingCard from "../../components/loadingCard";
import { BaseElementProps } from "../../types";
import classNames from "classnames";
import Permission from "common/models/permissions";
import PermissionGate from "../../components/permissionGate";
import Timestamp from "../../components/timestamp";
import SectionTitle from "../../components/sectionTitle";

export default function DeckSummaries({ className, style, project, number }: DeckSummariesProps) {
    const { data: reviewsData, isLoading: isLoadingReviews } = useGetReviewsQuery({ filter: { project, number } });
    const { data: cardsData, isLoading: isLoadingCards } = useGetCardsQuery({ filter: { project, number } });

    const isLoading = isLoadingReviews || isLoadingCards;

    const [fetchDeck] = useLazyGetTDBDeckQuery();
    const [deckGroups, setDeckGroups] = useState<Map<DeckLink | DecklistLink, { review: IPlaytestReview, card: IPlaytestCard, deck: IDecklist}>>();
    const [loading, setLoading] = useState<(DeckLink | DecklistLink)[]>([]);

    useEffect(() => {
        if (!reviewsData || reviewsData.total === 0 || !cardsData) {
            return;
        }
        const loadDeck = async (review: IPlaytestReview, card: IPlaytestCard, url: DeckLink | DecklistLink) => {
            try {
                const identifier = extractDeckIdentifier(url);
                if (!identifier) {
                    throw new Error("Deck Identifier could not be extracted");
                }
                const deck = await fetchDeck(identifier).unwrap();
                if (deck) {
                    setDeckGroups((prev) => {
                        const newDeckGroups = prev ?? new Map();
                        newDeckGroups.set(url, { review, card, deck });
                        return newDeckGroups;
                    });
                }
            } catch {
                // Do nothing
            } finally {
                setLoading((prev) => prev.filter((loadingUrl) => loadingUrl !== url));
            }
        };

        const deckVersionMap = new Map<DeckLink | DecklistLink, { review: IPlaytestReview, card: IPlaytestCard }>();
        for (const review of reviewsData.items) {
            for (const deck of review.decks) {
                // If it doesnt already exist, or if this review is a later version
                const current = deckVersionMap.get(deck);
                if (!current || gt(review.version, current?.card.version)) {
                    const card = cardsData.items.find((card) => card.version === review.version);
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
    }, [cardsData, deckGroups, fetchDeck, reviewsData]);


    const content = useMemo(() => {
        const sorted = deckGroups ? sortBy(Array.from(deckGroups?.entries()), ([, { deck }]) => deck.updated).reverse() : undefined;

        if (isLoading || (!deckGroups && loading.length > 0)) {
            return null;
        }
        if (!sorted) {
            return (
                <div className="p-4 bg-content1 border border-content3 shrink-0">
                    <div className="text-2xl font-cinzel"><FontAwesomeIcon icon={faScroll} /> No Maester has studied this card...</div>
                    <PermissionGate requires={Permission.MAKE_REVIEWS}>
                        <div className="text-sm font-sans">Submit a review to add your deck to the chain — others may then take it to the table.</div>
                    </PermissionGate>
                </div>
            );
        }

        return (
            <div className="flex-1 relative">
                <ScrollShadow className="absolute inset-0 overflow-y-auto p-2">
                    <div className="flex flex-col gap-2">
                        {sorted.map(([url, { review, card, deck }]) => (
                            <DeckSummary key={url} url={url} review={review} card={card} deck={deck} />
                        ))}
                    </div>
                </ScrollShadow>
            </div>
        );
    }, [deckGroups, isLoading, loading.length]);
    return (
        <div className={classNames("flex flex-col min-h-86 sm:min-h-64 md:min-h-52 flex-1", className)} style={style}>
            <SectionTitle>
                Decks for this card
            </SectionTitle>
            {content}
        </div>
    );
};

type DeckSummariesProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
}

function DeckSummary({ review, card, deck, url }: DeckSummaryProps) {
    const { data: user, isLoading } = useGetUserQuery({ discordId: review.reviewer });

    const faction = deck.faction;
    const agendas = [...deck.agendas].reverse();

    if (isLoading) {
        return (
            <Card className="p-0 w-full">
                <div className="px-3 py-1 flex items-center">
                    <Skeleton className="w-full h-8 rounded-md"/>
                </div>
                <Skeleton className="w-full h-8 rounded.md" />
                <div className="flex items-center py-1">
                    <CardStack cards={[undefined, undefined]} tilt={{ amount: -0.2, depth: 14 }} className="w-24 lg:w-32" shadow={false}>
                        {() => <LoadingCard />}
                    </CardStack>
                    <div className="ml-16 flex-1 flex flex-col px-2 gap-1">
                        <Skeleton className="w-32 h-6 rounded-md"/>
                        <Skeleton className="w-12 h-6 rounded-md"/>
                        <div className="flex flex-col md:flex-row mt-auto space-x-4 gap-1">
                            <Skeleton className="h-4 rounded-md"/>
                            <Skeleton className="h-4 rounded-md"/>
                        </div>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <Link key={url} href={url} target="_blank">
            <Card className="p-0 w-full hover:ring-2 ring-content3 transition-shadow duration-200">
                <div className="sm:hidden font-cinzel text-xl px-3 py-1 flex items-center min-w-0">
                    <span className='truncate'>{deck.name}</span>
                    <div className="ml-auto"><FontAwesomeIcon icon={faExternalLink}/></div>
                </div>
                <div className="sm:hidden bg-content2 text-base px-2 py-1">Crafted for <span className="font-bold">{card.name} v{card.version}</span></div>
                <div className="flex items-center py-1">
                    <CardStack cards={[...agendas, faction]} tilt={{ amount: -0.2, depth: (14 / agendas.length) }} className="w-24 lg:w-32" shadow={false}>
                        {(card, index) => <CardImage key={index} card={card} className="rounded-lg"/>}
                    </CardStack>
                    <div className="flex-1 flex flex-col px-2 gap-1 min-w-0">
                        <div className="max-sm:hidden pl-16 font-cinzel text-xl px-3 py-1 flex items-center min-w-0">
                            <span className='truncate'>{deck.name}</span>
                            <div className="ml-auto"><FontAwesomeIcon icon={faExternalLink}/></div>
                        </div>
                        <div className="max-sm:hidden pl-16 bg-content2 text-base px-2 py-1">Crafted for <span className="font-bold">{card.name} v{card.version}</span></div>
                        {card.latest ?
                            (
                                <div className="pl-16 text-sm text-success-500"><FontAwesomeIcon icon={faCheckCircle}/> The Citadel's records confirm this card is current — take this deck to the table with confidence.</div>
                            ) : (
                                <div className="pl-16 text-sm text-warning-500"><FontAwesomeIcon icon={faExclamationCircle}/> Consult the Citadel's records before taking this deck to the table — the card may have changed since these scrolls were last updated.</div>
                            )
                        }
                        <div className="pl-16 flex flex-col md:flex-row text-xs mt-auto text-foreground/50 space-x-4">
                            <div className="flex gap-1">
                                <Avatar src={user?.avatarUrl} name={user?.displayname ?? "?"} className="shrink-0 size-4"/>
                                <span>{user?.displayname ?? "Unknown Playtester"}</span>
                            </div>
                            <Timestamp date={deck.updated}/>
                        </div>
                    </div>
                </div>
            </Card>
        </Link>
    );
}

type DeckSummaryProps = {
    review: IPlaytestReview;
    card: IPlaytestCard;
    deck: IDecklist;
    url: DeckLink | DecklistLink;
}