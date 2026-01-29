import { BulkWriteOptions, DeleteOptions, MongoClient, Sort } from "mongodb";
import { dataService, logger } from "@/services";
import { asArray, groupBy } from "common/utils";
import * as CardsController from "gas/controllers/cardsController";
import { CardSheet } from "gas/spreadsheets/serializers/cardSerializer";
import MongoDataSource from "./dataSources/mongoDataSource";
import GASDataSource from "./dataSources/GASDataSource";
import { IPlaytestCard } from "common/models/cards";
import { DeepPartial, SingleOrArray, Sortable } from "common/types";
import { flatten } from "flat";
import { IRepository } from "@/types";
import PlaytestingCard from "../models/cards/playtestingCard";
import CardCollection from "common/collections/cardCollection";
import { gt } from "semver";

export default class CardsRepository implements IRepository<IPlaytestCard> {
    public database: CardMongoDataSource;
    public spreadsheet: CardDataSource;
    constructor(mongoClient: MongoClient) {
        this.database = new CardMongoDataSource(mongoClient);
        this.spreadsheet = new CardDataSource();
    }

    public async create(creating: IPlaytestCard): Promise<IPlaytestCard>;
    public async create(creating: IPlaytestCard[]): Promise<IPlaytestCard[]>;
    public async create(creating: SingleOrArray<IPlaytestCard>) {
        const result = await this.database.create(creating);
        // await this.spreadsheet.create(creating);
        return Array.isArray(creating) ? result : result[0];
    }

    public async read(reading?: SingleOrArray<DeepPartial<IPlaytestCard>>, orderBy?: Sortable<IPlaytestCard>, page?: number, perPage?: number) {
        const sort = orderBy ? flatten(orderBy) as Sort : undefined;
        const limit = perPage;
        const skip = (page - 1) * perPage;
        return await this.database.read(reading, { sort, limit, skip });
    }

    public async count(counting?: SingleOrArray<DeepPartial<IPlaytestCard>>) {
        return await this.database.count(counting);
    }

    public async collection(reading?: SingleOrArray<DeepPartial<IPlaytestCard>>, orderBy?: Sortable<IPlaytestCard>, page?: number, perPage?: number) {
        const result = await this.read(reading, orderBy, page, perPage);
        return new CardCollection(result.map((card) => new PlaytestingCard(card)));
    }

    public async update(updating: IPlaytestCard, upsert?: boolean): Promise<IPlaytestCard>;
    public async update(updating: IPlaytestCard[], upsert?: boolean): Promise<IPlaytestCard[]>;
    public async update(updating: SingleOrArray<IPlaytestCard>, upsert = true) {
        const result = await this.database.update(updating, { upsert });
        // await this.spreadsheet.update(updating, { upsert });
        return Array.isArray(updating) ? result : result[0];
    }

    public async destroy(destroying: SingleOrArray<DeepPartial<IPlaytestCard>>) {
        return await this.database.destroy(destroying);
        // await this.spreadsheet.destroy(destroying);
    }
}

class CardMongoDataSource extends MongoDataSource<IPlaytestCard> {
    constructor(client: MongoClient) {
        super(client, "cards", { project: 1, number: 1, version: 1 });
    }

    public override async create(creating: SingleOrArray<IPlaytestCard>, options?: BulkWriteOptions) {
        const cards = asArray(creating);
        // TODO: Implement image sync with online resource
        const result = await this.insertMany(cards, options);
        await this.syncLatest(result);
        return result;
    }

    public override async update(updating: SingleOrArray<IPlaytestCard>, options?: BulkWriteOptions & { upsert?: boolean }) {
        const cards = asArray(updating);
        // TODO: Implement image sync with online resource
        const result = await this.bulkWrite(cards, options);
        if (options?.upsert) {
            await this.syncLatest(result);
        }
        return result;
    }

    public override async destroy(deleting: SingleOrArray<DeepPartial<IPlaytestCard>>, options?: DeleteOptions) {
        const deleted = await super.destroy(deleting, options);
        // TODO: Implement image deletion to online resource

        // We must check if "latest" need to be reassigned.
        const wasLatest = deleted.filter((card) => card.latest);
        await this.syncLatest(wasLatest);

        return deleted;
    }

    /**
     * Updates all cards with the provided project/number combination to ensure latest flag is accurate
     */
    private async syncLatest(syncing: SingleOrArray<{ project: number, number: number }>) {
        const filter = asArray(syncing);
        if (filter.length === 0) {
            return;
        }
        // Do not consider draft cards in latest sync, as they cannot be latest
        const previous = await this.find({ ...filter, draft: false });

        const removeLatest: IPlaytestCard[] = [];
        const latest = new Map<string, IPlaytestCard>();

        for (const card of previous) {
            const key = `${card.project}|${card.number}`;
            const currentLatest = latest.get(key);

            if (!currentLatest || gt(card.version, currentLatest.version)) {
                if (currentLatest?.latest) {
                    removeLatest.push({ ...currentLatest, latest: false });
                }
                latest.set(key, card);
            } else if (card.latest) {
                removeLatest.push({ ...card, latest: false });
            }
        }
        const addLatest = Array.from(latest.values()).map((card) => ({ ...card, latest: true }));

        await this.update(addLatest.concat(removeLatest));

    }
}
class CardDataSource extends GASDataSource<IPlaytestCard> {
    public async create(creating: SingleOrArray<IPlaytestCard>) {
        const cards = asArray(creating);
        const groups = groupBy(cards, (card) => card.project);

        const created: IPlaytestCard[] = [];
        for (const [pNumber, pCards] of groups.entries()) {
            const [project] = await dataService.projects.read({ number: pNumber });

            const url = `${project.script}/cards/create`;
            const body = JSON.stringify(pCards);
            const response = await this.client.post<CardsController.CreateResponse>(url, null, body);
            created.push(...response.created);
            logger.verbose(`${created.length} card(s) created in Google App Script (${project.name})`);
        }
        return created;
    }

    public async read(reading?: SingleOrArray<DeepPartial<IPlaytestCard>>) {
        const cards = asArray(reading);
        const groups = groupBy(cards, (card) => card.project);
        // If no project is specified, read that from all active projects
        if (groups.has(undefined)) {
            const noProjectCards = groups.get(undefined);
            const allActiveProjects = await dataService.projects.read({ active: true });
            allActiveProjects.forEach((project) => groups.set(project.number, noProjectCards));
            groups.delete(undefined);
        }
        const read: IPlaytestCard[] = [];
        for (const [pNumber, pCards] of groups.entries()) {
            const [project] = await dataService.projects.read({ number: pNumber });
            // TODO: Error if project is missing
            for (const pCard of pCards) {
                const url = `${project.script}/cards`;
                const query = { filter: pCard };
                const response = await this.client.get<CardsController.ReadResponse>(url, query);
                read.push(...response.cards);
            }
            logger.verbose(`${read.length} card(s) read from Google App Script (${project.name})`);
        }
        return read;
    }

    public async update(updating: SingleOrArray<IPlaytestCard>, { upsert = true, sheets }: { upsert?: boolean; sheets?: CardSheet[] } = {}) {
        const cards = asArray(updating);
        const groups = groupBy(cards, (card) => card.project);
        const updated: IPlaytestCard[] = [];
        for (const [pNumber, pCards] of groups.entries()) {
            const [project] = await dataService.projects.read({ number: pNumber });
            // TODO: Error if project is missing
            const url = `${project.script}/cards/update`;
            const query = { upsert, sheets };
            const body = JSON.stringify(pCards);
            const response = await this.client.post<CardsController.UpdateResponse>(url, query, body);
            updated.push(...response.updated);
            logger.verbose(`${updated.length} card(s) updated in Google App Script (${project.name})`);
        }
        return updated;
    }

    public async destroy(destroying: SingleOrArray<DeepPartial<IPlaytestCard>>) {
        const cards = asArray(destroying);
        const groups = groupBy(cards, (card) => card.project);
        // If no project is specified, read that from all active projects
        if (groups.has(undefined)) {
            const noProjectCards = groups.get(undefined);
            const allActiveProjects = await dataService.projects.read({ active: true });
            allActiveProjects.forEach((project) => groups.set(project.number, noProjectCards));
            groups.delete(undefined);
        }
        const destroyed: IPlaytestCard[] = [];
        for (const [pNumber, pCards] of groups.entries()) {
            const [project] = await dataService.projects.read({ number: pNumber });

            for (const pCard of pCards) {
                const url = `${project.script}/cards/destroy`;
                const query = { filter: pCard };
                const response = await this.client.post<CardsController.DestroyResponse>(url, query);
                destroyed.push(...response.destroyed);
            }
            logger.verbose(`${destroyed.length} card(s) deleted in Google App Script (${project.name})`);
        }
        return destroyed.length;
    }
}