import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient, AnyBulkWriteOperation, Document } from "mongodb";
import { ISettingsDocument, SettingsType, ISettingsMap, IRewardPunishmentOption } from "common/models/settings";
import { computeSuggestionTags } from "common/designGuidelines/suggestionTags";
import { BasicAuditableRepository } from "./shared";

export default class SettingsRepository extends BasicAuditableRepository<"setting", ISettingsDocument> {
    private mongoClient: MongoClient;

    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<ISettingsDocument>(mongoClient, "settings", { type: 1 }), "setting");
        this.mongoClient = mongoClient;
    }

    public async getByType<T extends SettingsType>(type: T): Promise<ISettingsMap[T] | undefined> {
        const [doc] = await this.read({ type } as never);
        return doc?.data as ISettingsMap[T] | undefined;
    }

    /** How many suggestions currently use each reward/punishment id - queried directly against the
     *  suggestions collection (mirrors slotsRepository's byArtist). */
    public async suggestionRewardPunishmentUsage(): Promise<{
        rewardTypes: Record<string, number>;
        punishmentTypes: Record<string, number>;
    }> {
        const collection = this.mongoClient.db().collection("suggestions");

        const countBy = async (field: string): Promise<Record<string, number>> => {
            const results = await collection
                .aggregate<{ _id: string; count: number }>([
                    { $unwind: `$${field}` },
                    { $group: { _id: `$${field}`, count: { $sum: 1 } } }
                ])
                .toArray();
            return Object.fromEntries(results.map(({ _id, count }) => [_id, count]));
        };

        const [rewardTypes, punishmentTypes] = await Promise.all([
            countBy("questions.rewardTypes"),
            countBy("questions.punishment")
        ]);

        return { rewardTypes, punishmentTypes };
    }

    /** Recomputes `tags` for every suggestion referencing any of `changedIds` - scoped to just the
     *  affected suggestions, since this is the expensive path the caller warns about up front. */
    public async resyncSuggestionTags(
        changedIds: string[],
        rewardTypes: IRewardPunishmentOption[],
        punishmentTypes: IRewardPunishmentOption[]
    ): Promise<number> {
        if (changedIds.length === 0) {
            return 0;
        }

        const collection = this.mongoClient.db().collection("suggestions");
        const affected = await collection
            .find(
                {
                    $or: [
                        { "questions.rewardTypes": { $in: changedIds } },
                        { "questions.punishment": { $in: changedIds } }
                    ]
                },
                { projection: { _id: 1, "questions.rewardTypes": 1, "questions.punishment": 1 } }
            )
            .toArray();

        if (affected.length === 0) {
            return 0;
        }

        const ops: AnyBulkWriteOperation<Document>[] = affected.map((doc) => ({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: { tags: computeSuggestionTags(doc.questions ?? {}, rewardTypes, punishmentTypes) } }
            }
        }));
        await collection.bulkWrite(ops, { ordered: false });

        return ops.length;
    }
}
