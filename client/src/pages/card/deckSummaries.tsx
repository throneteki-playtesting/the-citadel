import {
    faExclamationCircle,
    faExternalLink,
    faScroll,
    faCheckCircle,
    faUserPen,
    faLayerGroup
} from "@fortawesome/free-solid-svg-icons";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ScrollShadow, Card, Link, Avatar, Chip, ChipProps } from "@heroui/react";
import { IDeck } from "common/models/decks";
import { Code, IPlaytestCard } from "common/models/cards";
import { sortBy } from "lodash-es";
import { useMemo } from "react";
import { useGetCardsQuery, useGetDecksQuery, useGetUserQuery } from "../../api";
import CardImage from "../../components/cardImage";
import CardStack from "../../components/cardStack";
import { BaseElementProps } from "../../types";
import classNames from "classnames";
import Permission from "common/models/permissions";
import PermissionGate from "../../components/permissionGate";
import Timestamp from "../../components/timestamp";
import SectionTitle from "../../components/sectionTitle";
import { TouchTooltip } from "../../components/touchTooltip";
import TooltipDetail from "../../components/tooltipDetail";
import { parseCardCode, parsePlaytestCode } from "common/utils";

export default function DeckSummaries({ className, style, project, number }: DeckSummariesProps) {
    const code = parseCardCode(false, project, number);
    const { data: decksData, isLoading: isLoadingDecks } = useGetDecksQuery({ filter: { project, number } });
    const { data: cardsData, isLoading: isLoadingCards } = useGetCardsQuery({ filter: { project, number } });

    const otherCardFilters = useMemo(() => {
        const pairs = new Map<string, { project: number; number: number }>();
        for (const deck of decksData?.items ?? []) {
            for (const otherCode of Object.keys(deck.cards) as Code[]) {
                if (otherCode === code) {
                    continue;
                }
                const parsed = parsePlaytestCode(otherCode);
                if (parsed) {
                    pairs.set(`${parsed.project}-${parsed.number}`, parsed);
                }
            }
        }
        return [...pairs.values()];
    }, [code, decksData?.items]);

    const { data: otherCardsData, isLoading: isLoadingOtherCards } = useGetCardsQuery(
        { filter: otherCardFilters },
        { skip: otherCardFilters.length === 0 }
    );

    const isLoading = isLoadingDecks || isLoadingCards || (otherCardFilters.length > 0 && isLoadingOtherCards);

    const content = useMemo(() => {
        if (isLoading) {
            return null;
        }
        const sorted = sortBy(decksData?.items ?? [], (deck) => deck.tdbUpdated).reverse();

        if (sorted.length === 0) {
            return (
                <div className="p-4 bg-content1 border border-content3 shrink-0">
                    <div className="text-2xl font-cinzel">
                        <FontAwesomeIcon icon={faScroll} /> No decks have been recorded in the Citadel's archives...
                    </div>
                    <PermissionGate requires={Permission.MAKE_REVIEWS}>
                        <div className="text-sm font-sans">
                            Submit a review with a deck to begin the chain — others may then take it to the table.
                        </div>
                    </PermissionGate>
                </div>
            );
        }

        const otherCards = otherCardsData?.items ?? [];

        return (
            <div className="relative sm:flex-1 sm:min-h-0">
                <ScrollShadow className="max-h-136 overflow-y-auto p-2 sm:absolute sm:inset-0 sm:max-h-none">
                    <div className="flex flex-col gap-2">
                        {sorted.map((deck) => (
                            <DeckSummary
                                key={deck.identifier}
                                deck={deck}
                                code={code}
                                card={cardsData?.items.find((card) => card.version === deck.cards[code])}
                                otherCards={otherCards}
                            />
                        ))}
                    </div>
                </ScrollShadow>
            </div>
        );
    }, [cardsData?.items, code, decksData?.items, isLoading, otherCardsData?.items]);

    return (
        <div className={classNames("flex flex-col sm:min-h-64 md:min-h-52", className)} style={style}>
            <SectionTitle>Decks for this card</SectionTitle>
            <div className="flex flex-col sm:flex-1 sm:min-h-0">{content}</div>
        </div>
    );
}

type DeckSummariesProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
};

function DeckSummary({ deck, code, card, otherCards }: DeckSummaryProps) {
    const { data: user, isLoading } = useGetUserQuery({ discordId: deck.updatedBy });

    const faction = deck.faction;
    const agendas = [...deck.agendas].reverse();

    const otherDeckCards = useMemo(() => {
        const result: IPlaytestCard[] = [];
        for (const otherCode of Object.keys(deck.cards) as Code[]) {
            if (otherCode === code) {
                continue;
            }
            const parsed = parsePlaytestCode(otherCode);
            const match =
                parsed &&
                otherCards.find(
                    (otherCard) =>
                        otherCard.project === parsed.project &&
                        otherCard.number === parsed.number &&
                        otherCard.version === deck.cards[otherCode]
                );
            if (match) {
                result.push(match);
            }
        }
        return result;
    }, [code, deck.cards, otherCards]);

    return (
        <Card className="p-0 w-full hover:ring-2 ring-content3 transition-shadow duration-200 relative">
            <Link href={deck.link} target="_blank" className="absolute inset-0 z-0">
                <span className="sr-only">{deck.name}</span>
            </Link>
            <div
                className={classNames(
                    "relative z-10 pointer-events-none flex flex-col items-stretch transition-opacity duration-500",
                    isLoading ? "opacity-0" : "opacity-100"
                )}
            >
                <div className="sm:hidden font-cinzel text-xl px-3 py-1 flex items-center min-w-0">
                    <span className="truncate">{deck.name}</span>
                    <div className="ml-auto">
                        <FontAwesomeIcon icon={faExternalLink} />
                    </div>
                </div>
                <div className="sm:hidden bg-content2 text-base px-2 py-1">
                    Crafted for{" "}
                    <span className="font-bold">
                        {card?.name} v{deck.cards[code]}
                    </span>
                </div>
                <div className="flex items-stretch p-1">
                    <CardStack
                        cards={[...agendas, faction]}
                        tilt={{ amount: -0.2, depth: 14 / agendas.length }}
                        className="w-24 lg:w-32 self-center"
                        shadow={false}
                    >
                        {(card, index) => <CardImage key={index} card={card} className="rounded-lg" />}
                    </CardStack>
                    <div className="flex-1 flex flex-col px-2 gap-1 min-w-0">
                        <div className="max-sm:hidden pl-16 font-cinzel text-xl px-3 py-1 flex items-center min-w-0">
                            <span className="truncate">{deck.name}</span>
                            <div className="ml-auto">
                                <FontAwesomeIcon icon={faExternalLink} />
                            </div>
                        </div>
                        <div className="max-sm:hidden pl-16 bg-content2 text-base px-2 py-1">
                            Crafted for{" "}
                            <span className="font-bold">
                                {card?.name} v{deck.cards[code]}
                            </span>
                        </div>
                        <div className="pl-16 flex-1 flex flex-wrap items-start content-start gap-1 min-h-14">
                            <SummaryChip
                                icon={card?.latest ? faCheckCircle : faExclamationCircle}
                                color={card?.latest ? "success" : "warning"}
                                label={card?.latest ? "Up to date" : "Out of date"}
                                heading="Card version"
                            >
                                {card?.latest
                                    ? `Crafted for v${deck.cards[code]}, still the current version in the Citadel's records — take this deck to the table with confidence.`
                                    : `Crafted for v${deck.cards[code]}, but this card has been revised since. Consult the Citadel's records before taking this deck to the table.`}
                            </SummaryChip>
                            {otherDeckCards.length > 0 && (
                                <SummaryChip
                                    icon={faLayerGroup}
                                    label={`+${otherDeckCards.length} other card${otherDeckCards.length === 1 ? "" : "s"}`}
                                    heading="Other playtesting cards"
                                >
                                    This deck also carries {otherDeckCards.length} other playtesting{" "}
                                    {otherDeckCards.length === 1 ? "card" : "cards"}, so its results may not rest on
                                    this card alone:
                                    <ul className="list-disc list-inside">
                                        {otherDeckCards.map((otherCard) => (
                                            <li key={parseCardCode(false, otherCard.project, otherCard.number)}>
                                                {otherCard.name} v{otherCard.version}
                                            </li>
                                        ))}
                                    </ul>
                                </SummaryChip>
                            )}
                            <SummaryChip
                                icon={deck.source === "review" ? faScroll : faUserPen}
                                label={deck.source === "review" ? "From review" : "Added manually"}
                                heading="How this deck arrived"
                            >
                                {deck.source === "review"
                                    ? "Submitted alongside a review of this card, so the deck and that feedback were recorded together."
                                    : "Added directly to the Citadel's archives, without an accompanying review of this card."}
                            </SummaryChip>
                        </div>
                        <div className="pl-16 flex flex-row items-center gap-2 text-xs text-foreground/50 min-w-0">
                            <div className="flex items-center gap-1 min-w-0">
                                <Avatar
                                    src={user?.avatarUrl}
                                    name={user?.displayname ?? "?"}
                                    className="shrink-0 size-4"
                                />
                                <span className="truncate">{user?.displayname ?? "Unknown Playtester"}</span>
                            </div>
                            <div className="ml-auto shrink-0 whitespace-nowrap">
                                <Timestamp date={deck.tdbUpdated} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}

function SummaryChip({ icon, color = "default", label, heading, children }: SummaryChipProps) {
    return (
        <TouchTooltip content={<TooltipDetail heading={heading}>{children}</TooltipDetail>} size="sm" delay={0}>
            <Chip
                size="sm"
                variant="flat"
                color={color}
                className="pointer-events-auto cursor-pointer h-7 px-1"
                startContent={<FontAwesomeIcon icon={icon} className="ml-1.5" />}
            >
                {label}
            </Chip>
        </TouchTooltip>
    );
}

type SummaryChipProps = {
    icon: IconDefinition;
    color?: ChipProps["color"];
    label: string;
    heading: React.ReactNode;
    children: React.ReactNode;
};

type DeckSummaryProps = {
    deck: IDeck;
    code: Code;
    card?: { name: string; latest: boolean };
    otherCards: IPlaytestCard[];
};
