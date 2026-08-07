import {
    APIGuildMember,
    Client,
    ClientEvents,
    Events,
    ForumChannel,
    GuildMember,
    APIUser,
    User,
    Role
} from "discord.js";
import { dataService, logger } from "@/services";
import { discordEventMiddleware } from "@/middleware/auth";
import { onCardForumMessageDeleted } from "./forums/cardForum";
import { onReviewForumMessageDeleted } from "./forums/playtestingReviews";
import { onReleaseCheckMessageDeleted } from "./forums/releaseChecks";

type SyncUserFn = (member: APIGuildMember | GuildMember | APIUser | User) => Promise<unknown>;
type SyncRoleFn = (role: Role) => Promise<unknown>;

export function registerEvents(client: Client, guildId: string, syncUser: SyncUserFn, syncRole: SyncRoleFn) {
    function on<E extends keyof ClientEvents>(event: E, handler: (...args: ClientEvents[E]) => Promise<void>) {
        client.on(event, async (...args) => {
            await discordEventMiddleware(undefined, () => handler(...args));
        });
    }

    // Syncs a member's nickname, avatar, and roles when their guild profile changes.
    on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
        if (newMember.guild.id !== guildId) return;

        const nicknameChanged = oldMember.nickname !== newMember.nickname;
        const avatarChanged = oldMember.avatar !== newMember.avatar;
        const rolesChanged =
            oldMember.roles.cache.size !== newMember.roles.cache.size ||
            oldMember.roles.cache.some((r) => !newMember.roles.cache.has(r.id));

        if (!nicknameChanged && !avatarChanged && !rolesChanged) return;

        const [user] = await dataService.users.read({ discordId: newMember.id });
        if (!user) return;

        logger.info(`[Discord] Member updated: ${newMember.user.username}`);
        await syncUser(newMember);
    });

    // Strips a departing member's roles, keeping the record so anything they authored still resolves
    on(Events.GuildMemberRemove, async (member) => {
        if (member.guild.id !== guildId) return;

        const [user] = await dataService.users.read({ discordId: member.id });
        if (!user || user.roles.length === 0) return;

        logger.info(`[Discord] Member left: ${member.user.username}`);
        await dataService.users.update({ ...user, roles: [] });
    });

    // Syncs a user's username and avatar when their global profile changes.
    on(Events.UserUpdate, async (oldUser, newUser) => {
        const usernameChanged = oldUser.username !== newUser.username;
        const avatarChanged = oldUser.avatar !== newUser.avatar;

        if (!usernameChanged && !avatarChanged) return;

        const [user] = await dataService.users.read({ discordId: newUser.id });
        if (!user) return;

        logger.info(`[Discord] User updated: ${newUser.username}`);
        await syncUser(newUser);
    });

    // Keeps guild roles in sync with the database on create, update, or delete.
    on(Events.GuildRoleCreate, async (role) => {
        if (role.guild.id !== guildId) return;
        logger.info(`[Discord] Role created: ${role.name}`);
        await syncRole(role);
    });

    on(Events.GuildRoleUpdate, async (_oldRole, newRole) => {
        if (newRole.guild.id !== guildId) return;
        logger.info(`[Discord] Role updated: ${newRole.name}`);
        await syncRole(newRole);
    });

    on(Events.GuildRoleDelete, async (role) => {
        if (role.guild.id !== guildId) return;
        const [existing] = await dataService.roles.read({ discordId: role.id });
        if (!existing) return;
        logger.info(`[Discord] Role deleted: ${role.name}`);
        await dataService.roles.update({ ...existing, active: false });
    });

    // Clears discord metadata from any card or review whose forum thread or message was deleted.
    on(Events.ThreadDelete, async (thread) => {
        if (thread.guildId !== guildId) return;
        if (!(thread.parent instanceof ForumChannel)) return;

        // Starter message URL uses the thread ID for both the channel and message segments
        const starterUrl = `https://discord.com/channels/${thread.guildId}/${thread.id}/${thread.id}`;
        await onForumMessageDeleted(thread.parent.name, starterUrl);
    });

    on(Events.MessageDelete, async (message) => {
        if (message.guildId !== guildId) return;
        if (!message.channel.isThread()) return;

        const parent = message.channel.parent;
        if (!(parent instanceof ForumChannel)) return;

        await onForumMessageDeleted(parent.name, message.url);
    });
}

async function onForumMessageDeleted(forumName: string, messageUrl: string) {
    switch (forumName) {
        case "card-forum":
            await onCardForumMessageDeleted(messageUrl);
            await onReleaseCheckMessageDeleted(messageUrl);
            break;
        case "playtesting-reviews":
            await onReviewForumMessageDeleted(messageUrl);
            break;
    }
}
