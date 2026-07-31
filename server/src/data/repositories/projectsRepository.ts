import { IProject } from "common/models/projects";
import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { BasicAuditableRepository } from "./shared";
import { SingleOrArray } from "common/types";
import { asArray } from "common/utils";
import { syncReleaseChecks } from "@/discord/announcements/releaseChecks";

export default class ProjectsRepository extends BasicAuditableRepository<"project"> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<IProject>(mongoClient, "projects", { number: 1 }), "project");
    }

    public override async create(creating: IProject, sync?: boolean, broadcast?: boolean): Promise<IProject>;
    public override async create(creating: IProject[], sync?: boolean, broadcast?: boolean): Promise<IProject[]>;
    public override async create(creating: SingleOrArray<IProject>, sync = true, broadcast = true) {
        let data = asArray(creating);
        data = await super.create(data, broadcast);
        if (sync) {
            data = await this.sync(data);
        }
        return Array.isArray(creating) ? data : data[0];
    }

    public override async update(
        updating: IProject,
        upsert?: boolean,
        sync?: boolean,
        broadcast?: boolean
    ): Promise<IProject>;
    public override async update(
        updating: IProject[],
        upsert?: boolean,
        sync?: boolean,
        broadcast?: boolean
    ): Promise<IProject[]>;
    public override async update(updating: SingleOrArray<IProject>, upsert = true, sync = true, broadcast = true) {
        let data = asArray(updating);
        data = await super.update(data, upsert, broadcast);
        if (sync) {
            data = await this.sync(data);
        }
        return Array.isArray(updating) ? data : data[0];
    }

    public async sync(syncing: IProject, forced?: boolean): Promise<IProject>;
    public async sync(syncing: IProject[], forced?: boolean): Promise<IProject[]>;
    public async sync(syncing: SingleOrArray<IProject>, forced = false) {
        let data = asArray(syncing);
        const syncs = [
            {
                priority: 0,
                func: () =>
                    syncReleaseChecks(data, forced).then((result) => {
                        data = result;
                    })
            }
        ];

        await this.internalSync(syncs);

        return Array.isArray(syncing) ? data : data[0];
    }
}
