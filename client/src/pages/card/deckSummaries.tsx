import { faExclamationCircle, faExternalLink, faScroll, faCheckCircle, faUserPen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ScrollShadow, Card, Link, Avatar } from "@heroui/react";
import { IDeck } from "common/models/decks";
import { Code } from "common/models/cards";
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
import { parseCardCode } from "common/utils";

export default function DeckSummaries({ className, style, project, number }: DeckSummariesProps) {
    const code = parseCardCode(false, project, number);
    const { data: decksData, isLoading: isLoadingDecks } = useGetDecksQuery({ filter: { project, number } });
    const { data: cardsData, isLoading: isLoadingCards } = useGetCardsQuery({ filter: { project, number } });

    const isLoading = isLoadingDecks || isLoadingCards;

    const content = useMemo(() => {
        if (isLoading) {
            return null;
        }
        const sorted = sortBy(decksData?.items ?? [], (deck) => deck.tdbUpdated).reverse();

        if (sorted.length === 0) {
            return (
                <div className="p-4 bg-content1 border border-content3 shrink-0">
                    <div className="text-2xl font-cinzel"><FontAwesomeIcon icon={faScroll} /> No decks have been recorded in the Citadel's archives...</div>
                    <PermissionGate requires={Permission.MAKE_REVIEWS}>
                        <div className="text-sm font-sans">Submit a review with a deck to begin the chain — others may then take it to the table.</div>
                    </PermissionGate>
                </div>
            );
        }

        return (
            <div className="flex-1 relative">
                <ScrollShadow className="absolute inset-0 overflow-y-auto p-2">
                    <div className="flex flex-col gap-2">
                        {sorted.map((deck) => (
                            <DeckSummary key={deck.identifier} deck={deck} code={code} card={cardsData?.items.find((card) => card.version === deck.cards[code])} />
                        ))}
                    </div>
                </ScrollShadow>
            </div>
        );
    }, [cardsData?.items, code, decksData?.items, isLoading]);

    return (
        <div className={classNames("flex flex-col flex-1 min-h-86 sm:min-h-64 md:min-h-52", className)} style={style}>
            <SectionTitle>
                Decks for this card
            </SectionTitle>
            <div className="flex flex-col flex-1">
                {content}
            </div>
        </div>
    );
};

type DeckSummariesProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
}

function DeckSummary({ deck, code, card }: DeckSummaryProps) {
    const { data: user, isLoading } = useGetUserQuery({ discordId: deck.updatedBy });

    const faction = deck.faction;
    const agendas = [...deck.agendas].reverse();

    return (
        <Card className="p-0 w-full hover:ring-2 ring-content3 transition-shadow duration-200 relative">
            <Link href={deck.link} target="_blank" className={classNames("transition-opacity duration-500", isLoading ? "opacity-0" : "opacity-100")}>
                <div className="sm:hidden font-cinzel text-xl px-3 py-1 flex items-center min-w-0">
                    <span className='truncate'>{deck.name}</span>
                    <div className="ml-auto"><FontAwesomeIcon icon={faExternalLink}/></div>
                </div>
                <div className="sm:hidden bg-content2 text-base px-2 py-1">Crafted for <span className="font-bold">{card?.name} v{deck.cards[code]}</span></div>
                <div className="flex items-center py-1">
                    <CardStack cards={[...agendas, faction]} tilt={{ amount: -0.2, depth: (14 / agendas.length) }} className="w-24 lg:w-32" shadow={false}>
                        {(card, index) => <CardImage key={index} card={card} className="rounded-lg"/>}
                    </CardStack>
                    <div className="flex-1 flex flex-col px-2 gap-1 min-w-0">
                        <div className="max-sm:hidden pl-16 font-cinzel text-xl px-3 py-1 flex items-center min-w-0">
                            <span className='truncate'>{deck.name}</span>
                            <div className="ml-auto"><FontAwesomeIcon icon={faExternalLink}/></div>
                        </div>
                        <div className="max-sm:hidden pl-16 bg-content2 text-base px-2 py-1">Crafted for <span className="font-bold">{card?.name} v{deck.cards[code]}</span></div>
                        {card?.latest ?
                            (
                                <div className="pl-16 text-sm text-success-500"><FontAwesomeIcon icon={faCheckCircle}/> The Citadel's records confirm this card is current — take this deck to the table with confidence.</div>
                            ) : (
                                <div className="pl-16 text-sm text-warning-500"><FontAwesomeIcon icon={faExclamationCircle}/> Consult the Citadel's records before taking this deck to the table — the card may have changed since these scrolls were last updated.</div>
                            )
                        }
                        <div className="pl-16 flex flex-col md:flex-row text-xs mt-auto text-foreground/50 space-x-4 items-start md:items-center">
                            <div className="flex gap-1">
                                <Avatar src={user?.avatarUrl} name={user?.displayname ?? "?"} className="shrink-0 size-4"/>
                                <span>{user?.displayname ?? "Unknown Playtester"}</span>
                            </div>
                            <Timestamp date={deck.tdbUpdated}/>
                        </div>
                    </div>
                </div>
            </Link>
            <TouchTooltip content={<div className="text-sm font-sans max-w-56 whitespace-normal">{deck.source === "review" ? "Submitted via a review" : "Submitted manually"}</div>} size="sm" delay={0} closeDelay={0}>
                <div className="absolute bottom-2 right-2 text-foreground/40">
                    <FontAwesomeIcon icon={deck.source === "review" ? faScroll : faUserPen}/>
                </div>
            </TouchTooltip>
        </Card>
    );
}

type DeckSummaryProps = {
    deck: IDeck;
    code: Code;
    card?: { name: string, latest: boolean };
}
