import {
    BulkWriteOptions,
    Collection,
    DeleteOptions,
    Filter as MongoFilter,
    FindOptions,
    IndexSpecification,
    MongoClient,
    OptionalUnlessRequiredId,
    WithId
} from "mongodb";
import { Filter, isOperatorObject, SingleOrArray } from "common/types";
import { asArray } from "common/utils";

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
    protected buildFilterQuery(values?: SingleOrArray<Filter<T>>): MongoFilter<T> {
        let query: Record<string, unknown> = {};

        if (values) {
            const flattenFilter = (value: Filter<T>): Record<string, unknown> => {
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

        return query as MongoFilter<T>;
    }

    protected withoutId(values: WithId<T>[]): T[];
    protected withoutId(values: WithId<T>): T;
    protected withoutId(values: SingleOrArray<WithId<T>>) {
        const stripId = (value: WithId<T>) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { _id, ...rest } = value;
            return rest as T;
        };
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
