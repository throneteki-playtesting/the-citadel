import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { logger } from "@/services";
import { IPlaytestReview } from "common/models/reviews";
import { asArray } from "common/utils";
import { DeepPartial, SingleOrArray } from "common/types";
import { AuditableRepository } from "./shared";
import { deleteInitial, syncPlaytestingReviews } from "@/discord/forums/playtestingReviews";

export default class ReviewsRepository extends AuditableRepository<IPlaytestReview> {
    public database: MongoDataSource<IPlaytestReview>;
    constructor(mongoClient: MongoClient) {
        super();
        this.database = new MongoDataSource<IPlaytestReview>(mongoClient, "reviews", { project: 1, number: 1, version: 1, reviewer: 1 });
    }

    public override async create(creating: IPlaytestReview, sync?: boolean): Promise<IPlaytestReview>;
    public override async create(creating: IPlaytestReview[], sync?: boolean): Promise<IPlaytestReview[]>;
    public override async create(creating: SingleOrArray<IPlaytestReview>, sync = true) {
        let data = asArray(creating);
        data = await super.create(data);
        if (sync) {
            data = await this.sync(data);
        }
        return Array.isArray(creating) ? data : data[0];
    }

    public override async update(updating: IPlaytestReview, upsert?: boolean, sync?: boolean): Promise<IPlaytestReview>;
    public override async update(updating: IPlaytestReview[], upsert?: boolean, sync?: boolean): Promise<IPlaytestReview[]>;
    public override async update(updating: SingleOrArray<IPlaytestReview>, upsert = true, sync = true) {
        let data = asArray(updating);
        data = await super.update(data, upsert);
        if (sync) {
            data = await this.sync(data);
        }
        return Array.isArray(updating) ? data : data[0];
    }

    public override async destroy(destroying: SingleOrArray<DeepPartial<IPlaytestReview>>) {
        let data = await this.database.destroy(destroying);
        data = await this.desync(data);
        return data;
    }

    public async sync(syncing: IPlaytestReview): Promise<IPlaytestReview>;
    public async sync(syncing: IPlaytestReview[]): Promise<IPlaytestReview[]>;
    public async sync(syncing: SingleOrArray<IPlaytestReview>) {
        let data = asArray(syncing);
        try {
            data = await syncPlaytestingReviews(data);
        } catch (err) {
            logger.warn(err);
        }
        return Array.isArray(syncing) ? data : data[0];
    }

    public async desync(desyncing: IPlaytestReview): Promise<IPlaytestReview>;
    public async desync(desyncing: IPlaytestReview[]): Promise<IPlaytestReview[]>;
    public async desync(desyncing: SingleOrArray<IPlaytestReview>) {
        const data = asArray(desyncing);
        try {
            for (const review of data) {
                await deleteInitial(review);
            }
        } catch (err) {
            logger.warn(err);
        }
        return Array.isArray(desyncing) ? data : data[0];
    }
}
// class ReviewDataSource extends GASDataSource<IPlaytestReview> {
//     public async create(creating: SingleOrArray<IPlaytestReview>) {
//         const reviews = asArray(creating);
//         const groups = groupBy(reviews, (review) => review.project);

//         const created: IPlaytestReview[] = [];
//         for (const [pNumber, pReviews] of groups.entries()) {
//             const [project] = await dataService.projects.read({ number: pNumber });
//             // TODO: Error if project is missing
//             const url = `${project.script}/reviews/create`;
//             const body = JSON.stringify(pReviews);
//             const response = await this.client.post<ReviewsController.CreateResponse>(url, null, body);
//             created.push(...response.created);
//             logger.verbose(`${created.length} review(s) created in Google App Script (${project.name})`);
//         }
//         return created;
//     }

//     public async read(reading?: SingleOrArray<DeepPartial<IPlaytestReview>>) {
//         const reviews = asArray(reading);
//         const groups = groupBy(reviews, (review) => review.project);
//         // If no project is specified, read that from all active projects
//         if (groups.has(undefined)) {
//             const noProjectCards = groups.get(undefined);
//             const allActiveProjects = await dataService.projects.read({ active: true });
//             allActiveProjects.forEach((project) => groups.set(project.number, noProjectCards));
//             groups.delete(undefined);
//         }

//         const read: IPlaytestReview[] = [];
//         for (const [pNumber, pReviews] of groups.entries()) {
//             const [project] = await dataService.projects.read({ number: pNumber });
//             // TODO: Error if project is missing
//             for (const pReview of pReviews) {
//                 const url = `${project.script}/cards`;
//                 const query = { filter: pReview };
//                 const response = await this.client.get<ReviewsController.ReadResponse>(url, query);
//                 read.push(...response.reviews);
//             }
//             logger.verbose(`${read.length} review(s) read from Google App Script (${project.name})`);
//         }
//         return read;
//     }

//     public async update(updating: SingleOrArray<IPlaytestReview>, { upsert = true }: { upsert?: boolean } = {}) {
//         const reviews = asArray(updating);
//         const groups = groupBy(reviews, (review) => review.project);
//         const updated: IPlaytestReview[] = [];
//         for (const [pNumber, pReviews] of groups.entries()) {
//             const [project] = await dataService.projects.read({ number: pNumber });
//             // TODO: Error if project is missing
//             const url = `${project.script}/cards/update`;
//             const query = { upsert };
//             const body = JSON.stringify(pReviews);
//             const response = await this.client.post<ReviewsController.UpdateResponse>(url, query, body);
//             updated.push(...response.updated);
//             logger.verbose(`${updated.length} review(s) updated in Google App Script (${project.name})`);
//         }
//         return updated;
//     }

//     public async destroy(destroying: SingleOrArray<DeepPartial<IPlaytestReview>>) {
//         const reviews = asArray(destroying);
//         const groups = groupBy(reviews, (review) => review.project);
//         // If no project is specified, read that from all active projects
//         if (groups.has(undefined)) {
//             const noProjectCards = groups.get(undefined);
//             const allActiveProjects = await dataService.projects.read({ active: true });
//             allActiveProjects.forEach((project) => groups.set(project.number, noProjectCards));
//             groups.delete(undefined);
//         }
//         const destroyed: IPlaytestReview[] = [];
//         for (const [pNumber, pReviews] of groups.entries()) {
//             const [project] = await dataService.projects.read({ number: pNumber });

//             for (const pReview of pReviews) {
//                 const url = `${project.script}/reviews/destroy`;
//                 const query = { filter: pReview };
//                 const response = await this.client.post<ReviewsController.DestroyResponse>(url, query);
//                 destroyed.push(...response.destroyed);
//             }
//             logger.verbose(`${destroyed.length} review(s) deleted in Google App Script (${project.name})`);
//         }
//         return destroyed.length;
//     }
// }