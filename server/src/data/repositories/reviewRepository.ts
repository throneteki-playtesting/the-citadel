import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { IPlaytestReview } from "common/models/reviews";
import { asArray } from "common/utils";
import { Filter, SingleOrArray } from "common/types";
import { BasicAuditableRepository } from "./shared";
import { deleteInitial, syncReviewForum } from "@/discord/forums/playtestingReviews";
import { dataService, logger } from "@/services";

export default class ReviewsRepository extends BasicAuditableRepository<"review"> {
    constructor(mongoClient: MongoClient) {
        super(
            new MongoDataSource<IPlaytestReview>(mongoClient, "reviews", {
                project: 1,
                number: 1,
                version: 1,
                reviewer: 1
            }),
            "review"
        );
    }

    public override async create(
        creating: IPlaytestReview,
        sync?: boolean,
        broadcast?: boolean
    ): Promise<IPlaytestReview>;
    public override async create(
        creating: IPlaytestReview[],
        sync?: boolean,
        broadcast?: boolean
    ): Promise<IPlaytestReview[]>;
    public override async create(creating: SingleOrArray<IPlaytestReview>, sync = true, broadcast = true) {
        let data = asArray(creating);
        data = await super.create(data, broadcast);
        if (sync) {
            data = await this.sync(data);
        }
        return Array.isArray(creating) ? data : data[0];
    }

    public override async update(
        updating: IPlaytestReview,
        upsert?: boolean,
        sync?: boolean,
        broadcast?: boolean
    ): Promise<IPlaytestReview>;
    public override async update(
        updating: IPlaytestReview[],
        upsert?: boolean,
        sync?: boolean,
        broadcast?: boolean
    ): Promise<IPlaytestReview[]>;
    public override async update(
        updating: SingleOrArray<IPlaytestReview>,
        upsert = true,
        sync = true,
        broadcast = true
    ) {
        let data = asArray(updating);
        data = await super.update(data, upsert, broadcast);
        if (sync) {
            data = await this.sync(data);
        }
        return Array.isArray(updating) ? data : data[0];
    }

    public override async destroy(destroying: SingleOrArray<Filter<IPlaytestReview>>) {
        let data = await this.database.destroy(destroying);
        data = await this.desync(data);
        return data;
    }

    public async sync(syncing: IPlaytestReview): Promise<IPlaytestReview>;
    public async sync(syncing: IPlaytestReview[]): Promise<IPlaytestReview[]>;
    public async sync(syncing: SingleOrArray<IPlaytestReview>) {
        let data = asArray(syncing);
        const syncs = [
            () =>
                syncReviewForum(data).then((result) => {
                    data = result;
                }),
            () => syncReviewDecks(data)
        ];

        await this.internalSync(syncs);

        return Array.isArray(syncing) ? data : data[0];
    }

    public async desync(desyncing: IPlaytestReview): Promise<IPlaytestReview>;
    public async desync(desyncing: IPlaytestReview[]): Promise<IPlaytestReview[]>;
    public async desync(desyncing: SingleOrArray<IPlaytestReview>) {
        const data = asArray(desyncing);
        const syncs = data.map((d) => () => deleteInitial(d));

        await this.internalSync(syncs);

        return Array.isArray(desyncing) ? data : data[0];
    }
}

// Refreshes the shared decks pool for every consented deck link across the given reviews.
// Unconsented (shared: false) links are left untouched - not added, not refreshed.
async function syncReviewDecks(reviews: IPlaytestReview[]) {
    const links = new Set(
        reviews.flatMap((review) => review.decks.filter((deck) => deck.shared).map((deck) => deck.link))
    );
    await Promise.all(
        [...links].map((link) => dataService.decks.refresh(link, "review").catch((err) => logger.warn(err)))
    );
}
