import MongoDataSource from "./dataSources/mongoDataSource";
import { Filter as MongoFilter, MongoClient, UpdateFilter } from "mongodb";
import { Filter, SingleOrArray } from "common/types";
import { countReactionsByType, ICardSuggestion, ReactionType } from "common/models/cards";
import { asArray } from "common/utils";
import Permission from "common/models/permissions";
import { SUGGESTION_APPROVAL_VOTE_THRESHOLD } from "common/designGuidelines/suggestionApproval";
import { dataService } from "@/services";
import { BasicAuditableRepository } from "./shared";
import {
    onSuggestionApproved,
    onSuggestionDeleted,
    onSuggestionReactionChanged,
    onSuggestionUnapproved,
    syncSuggestionForum
} from "@/discord/forums/suggestionForum";

type SuggestionReactions = NonNullable<NonNullable<ICardSuggestion["_metadata"]>["engagement"]>["reactions"];

function countLikes(reactions?: SuggestionReactions) {
    return countReactionsByType(reactions, "like");
}

export default class SuggestionsRepository extends BasicAuditableRepository<"suggestion"> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<ICardSuggestion>(mongoClient, "suggestions", { id: 1 }), "suggestion");
    }

    public override async create(
        creating: ICardSuggestion,
        sync?: boolean,
        broadcast?: boolean
    ): Promise<ICardSuggestion>;
    public override async create(
        creating: ICardSuggestion[],
        sync?: boolean,
        broadcast?: boolean
    ): Promise<ICardSuggestion[]>;
    public override async create(creating: SingleOrArray<ICardSuggestion>, sync = true, broadcast = true) {
        let data = asArray(creating);
        for (const create of data) {
            create.id = crypto.randomUUID();
        }
        data = await super.create(data, broadcast);
        if (sync) {
            data = await this.sync(data);
        }
        return Array.isArray(creating) ? data : data[0];
    }

    public override async update(
        updating: ICardSuggestion,
        upsert?: boolean,
        sync?: boolean,
        broadcast?: boolean
    ): Promise<ICardSuggestion>;
    public override async update(
        updating: ICardSuggestion[],
        upsert?: boolean,
        sync?: boolean,
        broadcast?: boolean
    ): Promise<ICardSuggestion[]>;
    public override async update(
        updating: SingleOrArray<ICardSuggestion>,
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

    public override async destroy(
        destroying: SingleOrArray<Filter<ICardSuggestion>>,
        sync: boolean = true
    ): Promise<ICardSuggestion[]> {
        const data = await super.destroy(destroying);
        if (sync) {
            await this.desync(data);
        }
        return data;
    }

    // Drafts never sync to Discord - first sync is submission (draft flips to false). internalSync
    // fire-and-forgets for client requests and awaits otherwise, same split cardsRepository.sync() uses.
    public async sync(syncing: ICardSuggestion): Promise<ICardSuggestion>;
    public async sync(syncing: ICardSuggestion[]): Promise<ICardSuggestion[]>;
    public async sync(syncing: SingleOrArray<ICardSuggestion>) {
        let data = asArray(syncing);
        const syncable = data.filter((suggestion) => !suggestion.draft);
        if (syncable.length > 0) {
            await this.internalSync([
                () =>
                    syncSuggestionForum(syncable).then((result) => {
                        const byId = new Map(result.map((suggestion) => [suggestion.id, suggestion]));
                        data = data.map((suggestion) => byId.get(suggestion.id) ?? suggestion);
                    })
            ]);
        }
        return Array.isArray(syncing) ? data : data[0];
    }

    public async desync(desyncing: ICardSuggestion[]): Promise<void> {
        const withThreads = desyncing.filter((suggestion) => suggestion._metadata?.discord?.messageUrl);
        if (withThreads.length === 0) {
            return;
        }
        await this.internalSync([() => Promise.all(withThreads.map((suggestion) => onSuggestionDeleted(suggestion)))]);
    }

    // Finds by id and applies a Mongo update, atomically - none of react/unreact/setApproval below
    // can use the ordinary update() path (that replaces the whole document, unsafe for reactions).
    private async findAndUpdate(
        id: string,
        update: UpdateFilter<ICardSuggestion>
    ): Promise<ICardSuggestion | undefined> {
        const updated = await this.database.collection.findOneAndUpdate(
            { id } as MongoFilter<ICardSuggestion>,
            update,
            { returnDocument: "after", projection: { _id: 0 } }
        );
        return (updated as ICardSuggestion | null) ?? undefined;
    }

    // Broadcast `silent: true` throughout this class - a reaction/approval can't clobber anyone's
    // in-progress edit, so there's nothing to ask before applying (unlike a real edit/draft save).
    public async react(
        id: string,
        discordId: string,
        reactType: ReactionType,
        syncDiscord: boolean = true
    ): Promise<ICardSuggestion | undefined> {
        // Read first so a like that crosses the approval threshold can be told apart from one that
        // doesn't - findAndUpdate only ever hands back one side of that comparison.
        const before = await this.database.collection.findOne({ id } as MongoFilter<ICardSuggestion>, {
            projection: { "_metadata.engagement.reactions": 1 }
        });
        const beforeLikes = countLikes(before?._metadata?.engagement?.reactions as SuggestionReactions);

        const suggestion = await this.findAndUpdate(id, {
            $set: { [`_metadata.engagement.reactions.${discordId}`]: { type: reactType, reactedAt: new Date() } }
        } as UpdateFilter<ICardSuggestion>);
        if (!suggestion) {
            return undefined;
        }

        const afterLikes = countLikes(suggestion._metadata?.engagement?.reactions);
        if (beforeLikes < SUGGESTION_APPROVAL_VOTE_THRESHOLD && afterLikes >= SUGGESTION_APPROVAL_VOTE_THRESHOLD) {
            await this.clearApproverIgnores(suggestion);
        }

        this.broadcastUpdates([suggestion], { silent: true });
        await this.syncReactionChange(suggestion, syncDiscord);
        return suggestion;
    }

    // Shared by react/unreact - a button click answering its own interaction already has the updated
    // state, so it passes syncDiscord: false to skip this otherwise-redundant edit.
    private async syncReactionChange(suggestion: ICardSuggestion, syncDiscord: boolean) {
        if (syncDiscord && suggestion._metadata?.discord?.messageUrl) {
            await this.internalSync([() => onSuggestionReactionChanged(suggestion)]);
        }
    }

    // Lifts a prior Ignore (given only while below the threshold) once a suggestion crosses it, so
    // it reappears in an approver's Ready to Approve queue rather than staying silently dismissed.
    private async clearApproverIgnores(suggestion: ICardSuggestion) {
        const approverIds = await dataService.users.findIdsByPermission(Permission.APPROVE_SUGGESTIONS);
        const reactions = suggestion._metadata?.engagement?.reactions ?? {};
        const toClear = [...approverIds].filter((approverId) => reactions[approverId]?.type === "ignore");
        if (toClear.length === 0) {
            return;
        }

        await this.database.collection.updateOne(
            { id: suggestion.id } as MongoFilter<ICardSuggestion>,
            {
                $unset: Object.fromEntries(
                    toClear.map((approverId) => [`_metadata.engagement.reactions.${approverId}`, ""])
                )
            } as UpdateFilter<ICardSuggestion>
        );

        // Keeps the in-memory copy (what gets broadcast/returned to the caller) in sync with what was
        // just persisted, rather than issuing a second read to re-fetch it.
        for (const approverId of toClear) {
            delete reactions[approverId];
        }
    }

    public async unreact(
        id: string,
        discordId: string,
        syncDiscord: boolean = true
    ): Promise<ICardSuggestion | undefined> {
        const suggestion = await this.findAndUpdate(id, {
            $unset: { [`_metadata.engagement.reactions.${discordId}`]: "" }
        } as UpdateFilter<ICardSuggestion>);
        if (!suggestion) {
            return undefined;
        }
        this.broadcastUpdates([suggestion], { silent: true });
        await this.syncReactionChange(suggestion, syncDiscord);
        return suggestion;
    }

    public async setApproval(id: string, approvedBy: string | undefined): Promise<ICardSuggestion | undefined> {
        const update: UpdateFilter<ICardSuggestion> = approvedBy
            ? {
                  $set: {
                      "_metadata.engagement.approvedBy": approvedBy,
                      "_metadata.engagement.approvedAt": new Date()
                  }
              }
            : { $unset: { "_metadata.engagement.approvedBy": "", "_metadata.engagement.approvedAt": "" } };
        const suggestion = await this.findAndUpdate(id, update);
        if (!suggestion) {
            return undefined;
        }
        this.broadcastUpdates([suggestion], { silent: true });
        if (suggestion._metadata?.discord?.messageUrl) {
            await this.internalSync([
                () => (approvedBy ? onSuggestionApproved(suggestion) : onSuggestionUnapproved(suggestion))
            ]);
        }
        return suggestion;
    }
}
