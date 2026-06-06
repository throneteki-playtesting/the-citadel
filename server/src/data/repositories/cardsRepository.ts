import { BulkWriteOptions, DeleteOptions, MongoClient } from "mongodb";
import { asArray, SemanticVersion } from "common/utils";
import MongoDataSource from "./dataSources/mongoDataSource";
import { IPlaytestCard } from "common/models/cards";
import { Filter, SingleOrArray } from "common/types";
import { flatten } from "flat";
import { gt, lt, rcompare } from "semver";
import { deleteImage, syncImage } from "@/rendering/hosting";
import { BasicAuditableRepository } from "./shared";
import { deleteDraft, syncCardForum } from "@/discord/forums/cardForum";
import { dataService, logger } from "@/services";
import { clearIssues, syncIssues } from "@/github/issues";
import { IPlaytestingUpdate } from "common/models/projects";
import { getContext } from "@/middleware/context";

export default class CardsRepository extends BasicAuditableRepository<IPlaytestCard> {
    declare protected database: CardMongoDataSource;
    constructor(mongoClient: MongoClient) {
        super(new CardMongoDataSource(mongoClient));
    }

    public override async create(creating: IPlaytestCard, sync?: boolean): Promise<IPlaytestCard>;
    public override async create(creating: IPlaytestCard[], sync?: boolean): Promise<IPlaytestCard[]>;
    public override async create(creating: SingleOrArray<IPlaytestCard>, sync = true) {
        let data = asArray(creating);
        data = await super.create(data);
        if (sync) {
            data = await this.sync(data);
        }
        return Array.isArray(creating) ? data : data[0];
    }

    public override async update(updating: IPlaytestCard, upsert?: boolean, sync?: boolean): Promise<IPlaytestCard>;
    public override async update(updating: IPlaytestCard[], upsert?: boolean, sync?: boolean): Promise<IPlaytestCard[]>;
    public override async update(updating: SingleOrArray<IPlaytestCard>, upsert = true, sync = true) {
        let data = asArray(updating);
        data = await super.update(data, upsert);
        if (sync) {
            data = await this.sync(data);
        }
        return Array.isArray(updating) ? data : data[0];
    }

    public override async destroy(destroying: SingleOrArray<Filter<IPlaytestCard>>) {
        let data = await this.database.destroy(destroying);
        data = await this.desync(data);
        return data;
    }

    public async sync(syncing: IPlaytestCard): Promise<IPlaytestCard>;
    public async sync(syncing: IPlaytestCard[]): Promise<IPlaytestCard[]>;
    public async sync(syncing: SingleOrArray<IPlaytestCard>) {
        let data = asArray(syncing);
        const syncs = [
            () => syncImage(data).then(result => { data = result; }),
            () => syncCardForum(data).then(result => { data = result; }),
            () => syncIssues(data).then(result => { data = result; }),
            () => dataService.playtestingUpdates.sync()
        ];

        const { source } = getContext();

        // Client does not need to wait for syncing to complete
        if (source === "client") {
            // Run image sync first (as others rely on it), then run the rest together
            void syncs[0]().catch(err => logger.warn(err)).then(() => {
                syncs.slice(1).forEach(fn => void fn().catch(err => logger.warn(err)));
            });
        } else {
            for (const fn of syncs) {
                try {
                    await fn();
                } catch (err) {
                    logger.warn(err);
                }
            }
        }
        return Array.isArray(syncing) ? data : data[0];
    }

    public async desync(desyncing: IPlaytestCard): Promise<IPlaytestCard>;
    public async desync(desyncing: IPlaytestCard[]): Promise<IPlaytestCard[]>;
    public async desync(desyncing: SingleOrArray<IPlaytestCard>) {
        const data = asArray(desyncing);
        const syncs = [
            () => deleteImage(data),
            () => Promise.all(data.filter(card => card.draft).map(draft => deleteDraft(draft))),
            () => clearIssues(data),
            () => dataService.playtestingUpdates.sync()
        ];

        const { source } = getContext();

        // Client does not need to wait for syncing to complete
        if (source === "client") {
            syncs.forEach(fn => void fn().catch(err => logger.warn(err)));
        } else {
            for (const fn of syncs) {
                try {
                    await fn();
                } catch (err) {
                    logger.warn(err);
                }
            }
        }

        return Array.isArray(desyncing) ? data : data[0];
    }

    public async previous(card: { project: number, number: number, version: SemanticVersion }) {
        const all = await this.read({ project: card.project, number: card.number });
        const lower = all.filter(item => lt(item.version, card.version));
        const sorted = lower.sort((x, y) => rcompare(x.version, y.version));
        return sorted.at(0);
    }

    public async forUpdate(playtestingUpdate: IPlaytestingUpdate) {
        const filters = Object.entries(playtestingUpdate.cardChanges).map(([number, version]) => ({ project: playtestingUpdate.project, number: parseInt(number), version }));
        const cards = await this.read(filters);
        return cards;
    }

    protected override async applyAudit(auditing: IPlaytestCard, isNew: boolean): Promise<IPlaytestCard>;
    protected override async applyAudit(auditing: IPlaytestCard[], isNew: boolean): Promise<IPlaytestCard[]>;
    protected override async applyAudit(auditing: SingleOrArray<IPlaytestCard>, isNew: boolean) {
        let audited = await super.applyAudit(asArray(auditing), isNew);
        // Intentionally excluding imageUrl
        const cardProperties = [
            "code", "cost", "deckLimit", "designer", "faction", "flavor", "icons", "illustrator", "loyal", "name", "plotStats", "strength", "traits", "text", "type", "unique", "quantity"
        ];

        const tempKey = (card: IPlaytestCard) => `${card.project}@${card.number}@${card.version}`;

        const existingFilter = audited.map(({ project, number, version }) => ({ project, number, version }));
        const existing = await this.read(existingFilter);
        const existingDocsMap = new Map<string, IPlaytestCard>();
        existing.forEach((card) => {
            existingDocsMap.set(tempKey(card), card);
        });

        audited = audited.map((card) => {
            const existing = existingDocsMap.get(tempKey(card));
            let hasChangedCard = !existing;
            if (existing) {
                const flatExisting = flatten(existing, { safe: false });
                const flatCard = flatten(card, { safe: false });
                hasChangedCard = cardProperties.some(
                    (field) => flatExisting[field] !== flatCard[field]
                );
            }

            return {
                ...card,
                ...(hasChangedCard && { cardUpdated: new Date() })
            };
        });
        return Array.isArray(auditing) ? audited : audited[0];
    }
}

class CardMongoDataSource extends MongoDataSource<IPlaytestCard> {
    constructor(client: MongoClient) {
        super(client, "cards", { project: 1, number: 1, version: 1 });
    }

    public override async create(creating: SingleOrArray<IPlaytestCard>, options?: BulkWriteOptions) {
        const cards = asArray(creating);
        const result = await this.insertMany(cards, options);
        return await this.syncLatest(result);
    }

    public override async update(updating: SingleOrArray<IPlaytestCard>, options?: BulkWriteOptions) {
        const cards = asArray(updating);
        const result = await this.bulkWrite(cards, options);
        return await this.syncLatest(result);
    }

    public override async destroy(deleting: SingleOrArray<Filter<IPlaytestCard>>, options?: DeleteOptions) {
        const deleted = await super.destroy(deleting, options);
        // We must check if "latest" need to be reassigned.
        if (deleted.some((card) => card.latest)) {
            return await this.syncLatest(deleted);
        }
        return deleted;
    }

    /**
     * Updates all cards with the provided project/number combination to ensure latest flag is accurate
     */
    private async syncLatest(syncing: IPlaytestCard): Promise<IPlaytestCard>;
    private async syncLatest(syncing: IPlaytestCard[]): Promise<IPlaytestCard[]>;
    private async syncLatest(syncing: SingleOrArray<IPlaytestCard>) {
        const syncingArray = asArray(syncing);
        const filter = syncingArray.map(({ project, number }) => ({ project, number, draft: false }));
        if (filter.length === 0) {
            return syncing;
        }
        // Do not consider draft cards in latest sync, as they cannot be latest
        const previous = await this.find({ $or: filter });

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

        const allChanges = addLatest.concat(removeLatest);
        await this.bulkWrite(allChanges);

        // If the card was updated in the recent changes, then use that. Otherwise, use original card.
        const result = syncingArray.map((card) => allChanges.find(({ project, number, version }) => project === card.project && number === card.number && version === card.version) ?? card);
        return Array.isArray(syncing) ? result : result[0];
    }
}
// class CardDataSource extends GASDataSource<IPlaytestCard> {
//     public async create(creating: SingleOrArray<IPlaytestCard>) {
//         const cards = asArray(creating);
//         const groups = groupBy(cards, (card) => card.project);

//         const created: IPlaytestCard[] = [];
//         for (const [pNumber, pCards] of groups.entries()) {
//             const [project] = await dataService.projects.read({ number: pNumber });

//             const url = `${project.script}/cards/create`;
//             const body = JSON.stringify(pCards);
//             const response = await this.client.post<CardsController.CreateResponse>(url, null, body);
//             created.push(...response.created);
//             logger.verbose(`${created.length} card(s) created in Google App Script (${project.name})`);
//         }
//         return created;
//     }

//     public async read(reading?: SingleOrArray<DeepPartial<IPlaytestCard>>) {
//         const cards = asArray(reading);
//         const groups = groupBy(cards, (card) => card.project);
//         // If no project is specified, read that from all active projects
//         if (groups.has(undefined)) {
//             const noProjectCards = groups.get(undefined);
//             const allActiveProjects = await dataService.projects.read({ active: true });
//             allActiveProjects.forEach((project) => groups.set(project.number, noProjectCards));
//             groups.delete(undefined);
//         }
//         const read: IPlaytestCard[] = [];
//         for (const [pNumber, pCards] of groups.entries()) {
//             const [project] = await dataService.projects.read({ number: pNumber });
//             // TODO: Error if project is missing
//             for (const pCard of pCards) {
//                 const url = `${project.script}/cards`;
//                 const query = { filter: pCard };
//                 const response = await this.client.get<CardsController.ReadResponse>(url, query);
//                 read.push(...response.cards);
//             }
//             logger.verbose(`${read.length} card(s) read from Google App Script (${project.name})`);
//         }
//         return read;
//     }

//     public async update(updating: SingleOrArray<IPlaytestCard>, { upsert = true, sheets }: { upsert?: boolean; sheets?: CardSheet[] } = {}) {
//         const cards = asArray(updating);
//         const groups = groupBy(cards, (card) => card.project);
//         const updated: IPlaytestCard[] = [];
//         for (const [pNumber, pCards] of groups.entries()) {
//             const [project] = await dataService.projects.read({ number: pNumber });
//             // TODO: Error if project is missing
//             const url = `${project.script}/cards/update`;
//             const query = { upsert, sheets };
//             const body = JSON.stringify(pCards);
//             const response = await this.client.post<CardsController.UpdateResponse>(url, query, body);
//             updated.push(...response.updated);
//             logger.verbose(`${updated.length} card(s) updated in Google App Script (${project.name})`);
//         }
//         return updated;
//     }

//     public async destroy(destroying: SingleOrArray<DeepPartial<IPlaytestCard>>) {
//         const cards = asArray(destroying);
//         const groups = groupBy(cards, (card) => card.project);
//         // If no project is specified, read that from all active projects
//         if (groups.has(undefined)) {
//             const noProjectCards = groups.get(undefined);
//             const allActiveProjects = await dataService.projects.read({ active: true });
//             allActiveProjects.forEach((project) => groups.set(project.number, noProjectCards));
//             groups.delete(undefined);
//         }
//         const destroyed: IPlaytestCard[] = [];
//         for (const [pNumber, pCards] of groups.entries()) {
//             const [project] = await dataService.projects.read({ number: pNumber });

//             for (const pCard of pCards) {
//                 const url = `${project.script}/cards/destroy`;
//                 const query = { filter: pCard };
//                 const response = await this.client.post<CardsController.DestroyResponse>(url, query);
//                 destroyed.push(...response.destroyed);
//             }
//             logger.verbose(`${destroyed.length} card(s) deleted in Google App Script (${project.name})`);
//         }
//         return destroyed.length;
//     }
// }