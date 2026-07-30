import * as Ver from "semver";
import { IPlaytestReview } from "../models/reviews";
import { SemanticVersion } from "../utils";

/**
 * An ordered collection of reviews, with options to only view latest card reviews
 *
 * Iterating through CardCollection will iterate through the latest card reviews
 */
class ReviewCollection<T extends IPlaytestReview> implements IReviewCollection<T> {
    public latest: T[] = [];
    public all: T[] = [];
    [number: number]: IReviewVersionCollection<T>;

    constructor(items: T[]) {
        const nMap = new Map<number, IReviewVersionCollection<T>>();
        for (const item of items) {
            this.all.push(item);

            const { number, version } = item;
            let vCollection = nMap.get(number);
            if (!vCollection) {
                vCollection = {
                    latest: [],
                    all: []
                } as IReviewVersionCollection<T>;
                nMap.set(number, vCollection);
            }

            vCollection.all.push(item);
            vCollection[version] = vCollection[version] || [];
            vCollection[version].push(item);

            const firstLatest = vCollection.latest[0];
            if (!firstLatest || Ver.eq(item.version, firstLatest.version)) {
                vCollection.latest.push(item);
            } else if (Ver.gt(item.version, firstLatest.version)) {
                vCollection.latest = [item];
            }
        }

        // Convert temporary map into collection values
        for (const [number, vCollection] of nMap) {
            this[number] = vCollection;
            const { latest } = vCollection;

            this.latest.push(...latest);
        }
    }

    [Symbol.iterator](): Iterator<T> {
        return this.latest[Symbol.iterator]();
    }
}

export interface IReviewCollection<T> {
    latest: T[];
    all: T[];
    [number: number]: IReviewVersionCollection<T>;
}

export interface IReviewVersionCollection<T> {
    latest: T[];
    all: T[];
    [version: SemanticVersion]: T[];
}

export default ReviewCollection;
