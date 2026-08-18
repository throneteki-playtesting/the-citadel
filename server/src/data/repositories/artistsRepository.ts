import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { SingleOrArray } from "common/types";
import { IArtist } from "common/models/artwork";
import { asArray } from "common/utils";
import { BasicAuditableRepository } from "./shared";

export default class ArtistsRepository extends BasicAuditableRepository<"artist"> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<IArtist>(mongoClient, "artists", { id: 1 }), "artist");
    }

    public override async create(creating: IArtist): Promise<IArtist>;
    public override async create(creating: IArtist[]): Promise<IArtist[]>;
    public override async create(creating: SingleOrArray<IArtist>) {
        let data = asArray(creating);
        for (const create of data) {
            create.id = crypto.randomUUID();
        }
        data = await super.create(data);
        return Array.isArray(creating) ? data : data[0];
    }
}
