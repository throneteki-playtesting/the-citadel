import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { IDeck } from "common/models/decks";
import { DeckLink, DecklistLink, DeepPartial, Filter, SingleOrArray } from "common/types";
import { Code, IPlaytestCard } from "common/models/cards";
import { extractDeckIdentifier, isPlaytestingCode, parseCardCode, parsePlaytestCode, resolveDeckCardVersions } from "common/utils";
import { uniqBy } from "lodash-es";
import { BasicAuditableRepository } from "./shared";
import { fetchTDBDeck } from "@/utils";
import { dataService } from "@/services";

export default class DecksRepository extends BasicAuditableRepository<"deck"> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<IDeck>(mongoClient, "decks", { identifier: 1 }), "deck");
    }

    /** Fetches a deck's latest data from ThronesDB, resolves card versions, and upserts it. `source` is always overwritten to reflect the latest trigger. */
    public async refresh(link: DeckLink | DecklistLink, source: IDeck["source"]): Promise<IDeck | undefined> {
        const identifier = extractDeckIdentifier(link);
        if (!identifier) {
            return undefined;
        }

        const decklist = await fetchTDBDeck(identifier);
        if (!decklist) {
            return undefined;
        }

        // Released codes can't be reverse-mapped to a project/number, so pull in every released
        // card instead and let resolveDeckCardVersions match them forward.
        const codes = Object.keys(decklist.slots) as Code[];
        const playtestFilters = codes.filter(isPlaytestingCode).map(parsePlaytestCode).filter((filter): filter is { project: number, number: number } => !!filter);
        const hasReleasedCodes = codes.some((code) => !isPlaytestingCode(code));
        const cardFilters = [...playtestFilters, ...(hasReleasedCodes ? [{ released: { $exists: true } }] : [])];
        const cards = cardFilters.length > 0 ? await dataService.cards.read(cardFilters) : [];

        const deckData = {
            identifier,
            link,
            name: decklist.name,
            faction: decklist.faction,
            agendas: decklist.agendas,
            tdbVersion: decklist.version,
            tdbUpdated: decklist.updated,
            cards: resolveDeckCardVersions(decklist.slots, decklist.updated, cards),
            source
        };

        const [existing] = await this.read({ identifier });
        return existing ? this.update({ ...existing, ...deckData }) : this.create(deckData as IDeck);
    }

    /** Returns every distinct deck containing a card matching the given filter(s) (resolved against the cards collection first). */
    public async forCards(filter: SingleOrArray<DeepPartial<IPlaytestCard>>): Promise<IDeck[]> {
        const cards = await dataService.cards.read(filter as Filter<IPlaytestCard>);
        if (cards.length === 0) {
            return [];
        }

        const orFilters = uniqBy(cards, (card) => `${card.project}|${card.number}|${card.version}`)
            .map((card) => ({ cards: { [parseCardCode(false, card.project, card.number)]: card.version } }));

        return this.read(orFilters);
    }
}
