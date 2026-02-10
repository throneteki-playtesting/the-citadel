import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient, Sort } from "mongodb";
import { dataService, logger } from "@/services";
import { IPlaytestReview } from "common/models/reviews";
import { asArray, groupBy } from "common/utils";
import * as ReviewsController from "gas/controllers/reviewsController";
import GASDataSource from "./dataSources/GASDataSource";
import { DeepPartial, SingleOrArray, Sortable } from "common/types";
import { IRepository } from "@/types";
import { flatten } from "flat";
import ReviewCollection from "common/collections/reviewCollection";

export default class ReviewsRepository implements IRepository<IPlaytestReview> {
    public database: MongoDataSource<IPlaytestReview>;
    public spreadsheet: ReviewDataSource;
    constructor(mongoClient: MongoClient) {
        this.database = new MongoDataSource<IPlaytestReview>(mongoClient, "reviews", { project: 1, number: 1, version: 1, reviewer: 1 });
        this.spreadsheet = new ReviewDataSource();
    }

    public async create(creating: IPlaytestReview): Promise<IPlaytestReview>;
    public async create(creating: IPlaytestReview[]): Promise<IPlaytestReview[]>;
    public async create(creating: SingleOrArray<IPlaytestReview>) {
        const result = await this.database.create(creating);
        // await this.spreadsheet.create(creating);
        return Array.isArray(creating) ? result : result[0];
    }

    public async read(reading?: SingleOrArray<DeepPartial<IPlaytestReview>>, orderBy?: Sortable<IPlaytestReview>, page?: number, perPage?: number) {
        const sort = orderBy ? flatten(orderBy) as Sort : undefined;
        const limit = perPage;
        const skip = (page - 1) * perPage;
        return await this.database.read(reading, { sort, limit, skip });
    }

    public async collection(reading?: SingleOrArray<DeepPartial<IPlaytestReview>>, orderBy?: Sortable<IPlaytestReview>, page?: number, perPage?: number) {
        const result = await this.read(reading, orderBy, page, perPage);
        return new ReviewCollection(result);
    }

    public async count(counting?: SingleOrArray<DeepPartial<IPlaytestReview>>) {
        return await this.database.count(counting);
    }

    public async update(updating: IPlaytestReview, upsert?: boolean): Promise<IPlaytestReview>;
    public async update(updating: IPlaytestReview[], upsert?: boolean): Promise<IPlaytestReview[]>;
    public async update(updating: SingleOrArray<IPlaytestReview>, upsert = true) {
        const result = await this.database.update(updating, { upsert });
        return Array.isArray(updating) ? result : result[0];
        // await this.spreadsheet.update(updating, { upsert });
    }

    public async destroy(destroying: SingleOrArray<DeepPartial<IPlaytestReview>>) {
        return await this.database.destroy(destroying);
        // await this.spreadsheet.destroy(destroying);
    }
}

class ReviewDataSource extends GASDataSource<IPlaytestReview> {
    public async create(creating: SingleOrArray<IPlaytestReview>) {
        const reviews = asArray(creating);
        const groups = groupBy(reviews, (review) => review.project);

        const created: IPlaytestReview[] = [];
        for (const [pNumber, pReviews] of groups.entries()) {
            const [project] = await dataService.projects.read({ number: pNumber });
            // TODO: Error if project is missing
            const url = `${project.script}/reviews/create`;
            const body = JSON.stringify(pReviews);
            const response = await this.client.post<ReviewsController.CreateResponse>(url, null, body);
            created.push(...response.created);
            logger.verbose(`${created.length} review(s) created in Google App Script (${project.name})`);
        }
        return created;
    }

    public async read(reading?: SingleOrArray<DeepPartial<IPlaytestReview>>) {
        const reviews = asArray(reading);
        const groups = groupBy(reviews, (review) => review.project);
        // If no project is specified, read that from all active projects
        if (groups.has(undefined)) {
            const noProjectCards = groups.get(undefined);
            const allActiveProjects = await dataService.projects.read({ active: true });
            allActiveProjects.forEach((project) => groups.set(project.number, noProjectCards));
            groups.delete(undefined);
        }

        const read: IPlaytestReview[] = [];
        for (const [pNumber, pReviews] of groups.entries()) {
            const [project] = await dataService.projects.read({ number: pNumber });
            // TODO: Error if project is missing
            for (const pReview of pReviews) {
                const url = `${project.script}/cards`;
                const query = { filter: pReview };
                const response = await this.client.get<ReviewsController.ReadResponse>(url, query);
                read.push(...response.reviews);
            }
            logger.verbose(`${read.length} review(s) read from Google App Script (${project.name})`);
        }
        return read;
    }

    public async update(updating: SingleOrArray<IPlaytestReview>, { upsert = true }: { upsert?: boolean } = {}) {
        const reviews = asArray(updating);
        const groups = groupBy(reviews, (review) => review.project);
        const updated: IPlaytestReview[] = [];
        for (const [pNumber, pReviews] of groups.entries()) {
            const [project] = await dataService.projects.read({ number: pNumber });
            // TODO: Error if project is missing
            const url = `${project.script}/cards/update`;
            const query = { upsert };
            const body = JSON.stringify(pReviews);
            const response = await this.client.post<ReviewsController.UpdateResponse>(url, query, body);
            updated.push(...response.updated);
            logger.verbose(`${updated.length} review(s) updated in Google App Script (${project.name})`);
        }
        return updated;
    }

    public async destroy(destroying: SingleOrArray<DeepPartial<IPlaytestReview>>) {
        const reviews = asArray(destroying);
        const groups = groupBy(reviews, (review) => review.project);
        // If no project is specified, read that from all active projects
        if (groups.has(undefined)) {
            const noProjectCards = groups.get(undefined);
            const allActiveProjects = await dataService.projects.read({ active: true });
            allActiveProjects.forEach((project) => groups.set(project.number, noProjectCards));
            groups.delete(undefined);
        }
        const destroyed: IPlaytestReview[] = [];
        for (const [pNumber, pReviews] of groups.entries()) {
            const [project] = await dataService.projects.read({ number: pNumber });

            for (const pReview of pReviews) {
                const url = `${project.script}/reviews/destroy`;
                const query = { filter: pReview };
                const response = await this.client.post<ReviewsController.DestroyResponse>(url, query);
                destroyed.push(...response.destroyed);
            }
            logger.verbose(`${destroyed.length} review(s) deleted in Google App Script (${project.name})`);
        }
        return destroyed.length;
    }
}