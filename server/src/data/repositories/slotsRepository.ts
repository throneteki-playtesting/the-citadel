import { ISlot, ISlotRef } from "common/models/slots";
import { IRefinementInquiry, nextInquiryNumber } from "common/models/refinement";
import MongoDataSource from "./dataSources/mongoDataSource";
import { Filter as MongoFilter, MongoClient, UpdateFilter } from "mongodb";
import { BasicAuditableRepository } from "./shared";
import { Filter, SingleOrArray } from "common/types";
import { asArray } from "common/utils";
import { deleteReleaseChecks, syncReleaseChecks } from "@/discord/forums/releaseChecks";

export default class SlotsRepository extends BasicAuditableRepository<"slot"> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<ISlot>(mongoClient, "slots", { project: 1, number: 1 }), "slot");
    }

    public override async create(creating: ISlot, sync?: boolean, broadcast?: boolean): Promise<ISlot>;
    public override async create(creating: ISlot[], sync?: boolean, broadcast?: boolean): Promise<ISlot[]>;
    public override async create(creating: SingleOrArray<ISlot>, sync = true, broadcast = true) {
        let data = asArray(creating);
        data = await super.create(data, broadcast);
        if (sync) {
            data = await this.sync(data);
        }
        return Array.isArray(creating) ? data : data[0];
    }

    public override async update(
        updating: ISlot,
        upsert?: boolean,
        sync?: boolean,
        broadcast?: boolean
    ): Promise<ISlot>;
    public override async update(
        updating: ISlot[],
        upsert?: boolean,
        sync?: boolean,
        broadcast?: boolean
    ): Promise<ISlot[]>;
    public override async update(updating: SingleOrArray<ISlot>, upsert = true, sync = true, broadcast = true) {
        let data = asArray(updating);
        data = await super.update(data, upsert, broadcast);
        if (sync) {
            data = await this.sync(data);
        }
        return Array.isArray(updating) ? data : data[0];
    }

    public override async destroy(destroying: SingleOrArray<Filter<ISlot>>, sync: boolean = true) {
        let data = await super.destroy(destroying);
        if (sync) {
            data = await this.desync(data);
        }
        return data;
    }

    public async sync(syncing: ISlot): Promise<ISlot>;
    public async sync(syncing: ISlot[]): Promise<ISlot[]>;
    public async sync(syncing: SingleOrArray<ISlot>) {
        let data = asArray(syncing);
        const syncs = [
            () =>
                syncReleaseChecks(data).then((result) => {
                    data = result;
                })
        ];

        await this.internalSync(syncs);

        return Array.isArray(syncing) ? data : data[0];
    }

    /**
     * Appends an inquiry under the next free number, retrying when another writer takes it first. Guarded
     * on that number being unused, so two people raising at once can't compute the same number and collide.
     */
    public async appendInquiry(
        ref: ISlotRef,
        build: (inquiry: number) => IRefinementInquiry,
        attempts = 3
    ): Promise<ISlot | undefined> {
        for (let attempt = 0; attempt < attempts; attempt++) {
            const [slot] = await this.read({ project: ref.project, number: ref.number });
            if (!slot) {
                return undefined;
            }

            const entry = build(nextInquiryNumber(slot.statuses.design.inquiries));
            const updated = await this.database.collection.findOneAndUpdate(
                {
                    project: ref.project,
                    number: ref.number,
                    "statuses.design.inquiries.inquiry": { $ne: entry.inquiry }
                } as MongoFilter<ISlot>,
                {
                    $push: { "statuses.design.inquiries": entry },
                    $set: { updated: entry.updated, updatedBy: entry.updatedBy }
                } as UpdateFilter<ISlot>,
                { returnDocument: "after", projection: { _id: 0 } }
            );

            if (updated) {
                const result = updated as ISlot;
                this.broadcastUpdates([result]);
                return result;
            }
        }

        throw new Error(`Could not allocate an inquiry number for slot ${ref.project}|${ref.number}`);
    }

    // Queried against the collection directly, since Filter has no way to match one field of an array's entries
    public async byArtist(artist: string): Promise<ISlotRef[]> {
        return await this.database.collection
            .find(
                {
                    $or: [
                        { "statuses.artwork.sourced.options.artist": artist },
                        { "statuses.artwork.commissioned.artist": artist }
                    ]
                },
                { projection: { _id: 0, project: 1, number: 1 }, sort: { project: 1, number: 1 } }
            )
            .toArray();
    }

    public async desync(desyncing: ISlot): Promise<ISlot>;
    public async desync(desyncing: ISlot[]): Promise<ISlot[]>;
    public async desync(desyncing: SingleOrArray<ISlot>) {
        const data = asArray(desyncing);
        const syncs = [() => deleteReleaseChecks(data)];

        await this.internalSync(syncs);

        return Array.isArray(desyncing) ? data : data[0];
    }
}
