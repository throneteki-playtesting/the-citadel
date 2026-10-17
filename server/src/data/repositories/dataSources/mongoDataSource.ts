import {
    BulkWriteOptions,
    Collection,
    DeleteOptions,
    Document,
    Filter as MongoFilter,
    FindOptions,
    IndexSpecification,
    MongoClient,
    OptionalUnlessRequiredId,
    Sort as MongoSort,
    WithId
} from "mongodb";
import { Filter, isOperatorObject, SingleOrArray } from "common/types";
import { asArray } from "common/utils";
import { omit } from "lodash-es";

// A `find()` cursor's `sort` option accepts the friendly "asc"/"desc" strings and translates them itself,
// but a raw `$sort` stage inside an aggregation pipeline is sent to the server as-is and only accepts
// numeric 1/-1 (or `$meta`) - so a pipeline-based sort needs that translation done here instead.
function toAggregationSort(sort: MongoSort): Document {
    const direction = (value: unknown): 1 | -1 | undefined => {
        if (value === 1 || value === "asc" || value === "ascending") {
            return 1;
        }
        if (value === -1 || value === "desc" || value === "descending") {
            return -1;
        }
        return undefined;
    };

    const result: Document = {};
    for (const [key, value] of Object.entries(sort)) {
        result[key] = direction(value) ?? value;
    }
    return result;
}

export default class MongoDataSource<T> {
    public collection: Collection<T>;
    public primaryKeys: string[];
    constructor(
        client: MongoClient,
        protected name: string,
        primaryKeys: IndexSpecification = {}
    ) {
        this.collection = client.db().collection<T>(name);
        this.primaryKeys = Object.keys(primaryKeys);
        if (this.primaryKeys.length > 0) {
            this.collection.createIndex(primaryKeys, { unique: true });
        } else {
            // If no primary keys supplied, use _id
            this.primaryKeys.push("_id");
        }
    }
    // Generic over F (not fixed to T) so it can also flatten a Filter<T & V> once virtual fields are mixed in
    protected buildFilterQuery<F = T>(values?: SingleOrArray<Filter<F>>): MongoFilter<F> {
        let query: Record<string, unknown> = {};

        if (values) {
            const flattenFilter = (value: Filter<F>): Record<string, unknown> => {
                const result: Record<string, unknown> = {};

                const traverse = (obj: Record<string, unknown>, prefix: string) => {
                    for (const [key, val] of Object.entries(obj)) {
                        const fullKey = prefix ? `${prefix}.${key}` : key;
                        if (isOperatorObject(val)) {
                            result[fullKey] = val;
                        } else if (
                            val !== null &&
                            typeof val === "object" &&
                            !Array.isArray(val) &&
                            !(val instanceof Date)
                        ) {
                            traverse(val as Record<string, unknown>, fullKey);
                        } else {
                            result[fullKey] = val;
                        }
                    }
                };

                traverse(value as Record<string, unknown>, "");
                return result;
            };

            if (!Array.isArray(values)) {
                query = flattenFilter(values);
            } else if (values.length > 0) {
                query = values.length === 1 ? flattenFilter(values[0]) : { $or: values.map((v) => flattenFilter(v)) };
            }
        }

        for (const [key, value] of Object.entries(query)) {
            if (isOperatorObject(value)) {
                continue;
            } else if (value === undefined) {
                query[key] = { $exists: true };
            } else if (value === null) {
                query[key] = { $exists: false };
            }
        }

        return query as MongoFilter<F>;
    }

    // Generic over F (not fixed to T) so aggregateRead can also strip _id from a T & V result
    protected withoutId<F = T>(values: WithId<F>[]): F[];
    protected withoutId<F = T>(values: WithId<F>): F;
    protected withoutId<F = T>(values: SingleOrArray<WithId<F>>) {
        const stripId = (value: WithId<F>) => omit(value, "_id") as F;
        if (Array.isArray(values)) {
            return values.map(stripId);
        }
        return values ? stripId(values) : values;
    }
    public async create(creating: SingleOrArray<T>, options?: BulkWriteOptions) {
        const docs = asArray(creating);
        const result = await this.insertMany(docs, options);
        return result;
    }

    public async read(reading?: SingleOrArray<Filter<T>>, options?: FindOptions) {
        const query = this.buildFilterQuery(reading);
        const result = await this.find(query, options);
        return result;
    }

    public async readOne(reading?: Filter<T>, options?: FindOptions) {
        const query = this.buildFilterQuery(reading);
        const result = await this.findOne(query, options);
        return result;
    }

    public async count(counting?: SingleOrArray<Filter<T>>) {
        const query = this.buildFilterQuery(counting);
        const result = await this.total(query);
        return result;
    }

    // Like `read`, but runs `virtualStages` first so `reading`/`options.sort` can reference computed fields
    public async aggregateRead<V = unknown>(
        virtualStages: Document[],
        reading?: SingleOrArray<Filter<T & V>>,
        options?: { sort?: MongoSort; skip?: number; limit?: number }
    ): Promise<(T & V)[]> {
        const query = this.buildFilterQuery(reading);
        const pipeline: Document[] = [...virtualStages, { $match: query }];
        if (options?.sort) {
            pipeline.push({ $sort: toAggregationSort(options.sort) });
        }
        if (options?.skip) {
            pipeline.push({ $skip: options.skip });
        }
        if (options?.limit) {
            pipeline.push({ $limit: options.limit });
        }
        const result = await this.collection.aggregate<WithId<T & V>>(pipeline).toArray();
        return this.withoutId<T & V>(result);
    }

    // Counterpart to aggregateRead, for count against the same virtual fields
    public async aggregateCount<V = unknown>(
        virtualStages: Document[],
        counting?: SingleOrArray<Filter<T & V>>
    ): Promise<number> {
        const query = this.buildFilterQuery(counting);
        const pipeline: Document[] = [...virtualStages, { $match: query }, { $count: "total" }];
        const [result] = await this.collection.aggregate<{ total: number }>(pipeline).toArray();
        return result?.total ?? 0;
    }

    public async update(updating: SingleOrArray<T>, options?: BulkWriteOptions & { upsert?: boolean }) {
        const docs = asArray(updating);
        const result = await this.bulkWrite(docs, options);
        return result;
    }
    public async destroy(deleting: SingleOrArray<Filter<T>>, options?: DeleteOptions) {
        const query = this.buildFilterQuery(deleting);
        const result = await this.deleteMany(query, options);
        return result;
    }

    // Mongo Commands //
    protected async insertMany(docs: T[], options?: BulkWriteOptions) {
        if (docs.length === 0) {
            return [];
        }
        const results = await this.collection.insertMany(docs as OptionalUnlessRequiredId<T>[], {
            ordered: false,
            ...options
        });

        // Sanitise docs in case _id was added
        docs.forEach((doc) => {
            if (doc["_id"]) {
                delete doc["_id"];
            }
        });
        // Return docs which were actually inserted (no duplicates)
        return Object.keys(results.insertedIds).map((index) => docs[index] as T);
    }

    protected async find(query: MongoFilter<T>, options?: FindOptions) {
        const result = await this.collection.find(query, options).toArray();

        return this.withoutId(result);
    }

    protected async findOne(query: MongoFilter<T>, options?: FindOptions) {
        const result = await this.collection.findOne(query, options);

        return this.withoutId(result);
    }

    protected async total(query: MongoFilter<T>) {
        const result = await this.collection.countDocuments(query);

        return result;
    }

    protected async bulkWrite(
        docs: T[],
        { upsert, ...options }: BulkWriteOptions & { upsert?: boolean } = { upsert: true }
    ) {
        if (docs.length === 0) {
            return [];
        }
        const defaultOptions = (doc: T) => {
            const filter = this.primaryKeys.reduce((f, pk) => {
                f[pk] = doc[pk];
                return f;
            }, {});

            return { filter, upsert };
        };
        const results = await this.collection.bulkWrite(
            docs.map((doc) => ({
                replaceOne: {
                    ...defaultOptions(doc),
                    replacement: doc
                }
            })),
            { ordered: false, ...options }
        );

        const failed = new Set(results.getWriteErrors().map((we) => we.index));
        const success = docs.filter((_, index) => !failed.has(index));

        return success;
    }

    protected async deleteMany(query: MongoFilter<T>, options?: DeleteOptions) {
        if (Object.keys(query).length === 0) {
            return []; // Do not delete anything if there are no query parameters
        }
        const deleting = await this.find(query);
        await this.collection.deleteMany(query, options);
        return deleting;
    }
}
