import { buildCommands, deployCommands } from "./deployCommands";
import { commands } from "./commands";
import { dataService, logger } from "@/services";
import { Client, ForumChannel, Guild, ThreadChannel, Events, FetchedThreadsMore, APIGuildMember, GuildMember, APIUser, User, Role } from "discord.js";
import { Role as AppRole } from "common/models/auth";
import { discordCommandMiddleware } from "@/middleware/auth";
import cron from "node-cron";

class DiscordService {
    private client: Client;
    private guildId: string;
    constructor() {
        this.guildId = process.env.DISCORD_GUILD_ID;
        const token = process.env.DISCORD_TOKEN;
        const clientId = process.env.DISCORD_CLIENT_ID;

        this.client = new Client({
            intents: ["Guilds", "GuildMessages", "DirectMessages", "GuildPresences", "GuildMembers"],
            allowedMentions: { parse: ["users", "roles"], repliedUser: true }
        });

        this.client.once(Events.ClientReady, (client) => {
            logger.info(`Discord connected with ${client.user.tag}`);

            // Syncs necessary data once on startup, then once a day
            logger.info("[Discord] Running daily sync...");
            this.syncAll();
            if (process.env.NODE_ENV === "production") {
                cron.schedule("0 0 * * *", () => this.syncAll());
                logger.info("[Discord] Daily sync scheduled");
            }
        });

        buildCommands().then((available) => {
            const deployOptions = { token, clientId };
            this.client.on(Events.GuildCreate, async (guild) => {
                if (this.isGuild(guild)) {
                    await deployCommands(available, { ...deployOptions, guild });
                }
            });
            this.client.on(Events.GuildAvailable, async (guild) => {
                if (this.isGuild(guild)) {
                    await deployCommands(available, { ...deployOptions, guild });
                }
            });
        });

        this.client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
            if (!this.isGuild(newMember.guild)) return;

            const nicknameChanged = oldMember.nickname !== newMember.nickname;
            const avatarChanged = oldMember.avatar !== newMember.avatar;
            const rolesChanged = oldMember.roles.cache.size !== newMember.roles.cache.size || oldMember.roles.cache.some((r) => !newMember.roles.cache.has(r.id));

            if (!nicknameChanged && !avatarChanged && !rolesChanged) return;

            const [user] = await dataService.users.read({ discordId: newMember.id });
            if (!user) return;

            logger.info(`[Discord] Member updated: ${newMember.user.username}`);
            await DiscordService.syncUser(newMember);
        });

        this.client.on(Events.UserUpdate, async (oldUser, newUser) => {
            const usernameChanged = oldUser.username !== newUser.username;
            const avatarChanged = oldUser.avatar !== newUser.avatar;

            if (!usernameChanged && !avatarChanged) return;

            const [user] = await dataService.users.read({ discordId: newUser.id });
            if (!user) return;

            logger.info(`[Discord] User updated: ${newUser.username}`);
            await DiscordService.syncUser(newUser);
        });

        this.client.on(Events.GuildRoleCreate, async (role) => {
            if (!this.isGuild(role.guild)) return;
            logger.info(`[Discord] Role created: ${role.name}`);
            await DiscordService.syncRole(role);
        });

        this.client.on(Events.GuildRoleUpdate, async (_oldRole, newRole) => {
            if (!this.isGuild(newRole.guild)) return;
            logger.info(`[Discord] Role updated: ${newRole.name}`);
            await DiscordService.syncRole(newRole);
        });

        this.client.on(Events.GuildRoleDelete, async (role) => {
            if (!this.isGuild(role.guild)) return;
            const [existing] = await dataService.roles.read({ discordId: role.id });
            if (!existing) return;
            logger.info(`[Discord] Role deleted: ${role.name}`);
            await dataService.roles.update({ ...existing, active: false });
        });

        this.client.on(Events.InteractionCreate, async (interaction) => {
            try {
                if (!this.isGuild(interaction.guild)) {
                    return;
                }
                if (interaction.isCommand() || interaction.isAutocomplete()) {
                    await discordCommandMiddleware(interaction.member, async () => {
                        const command = commands[interaction.commandName as keyof typeof commands];
                        if (interaction.isChatInputCommand()) {
                            await command.execute(interaction);
                        } else if (interaction.isAutocomplete() && command.autocomplete) {
                            await command.autocomplete(interaction);
                        }
                    });
                }
            } catch (err) {
                logger.error(err);
            }
        });

        this.client.login(token);
    }

    public async getGuild() {
        return await this.client.guilds.fetch(this.guildId);
    }

    private isGuild(guild: Guild) {
        return guild.id === this.guildId;
    }

    /**
     * Finds a forum thread through a function
     * @param forum Forum to check for threads
     * @param threadFunc Function to match thread on
     * @returns The found thread, or null if none can be found within the given Forum Channel
     */
    public async findForumThread(forum: ForumChannel, threadFunc: (thread: ThreadChannel) => Promise<boolean> | boolean) {
        // First check unarchived threads
        const active = await forum.threads.fetchActive();
        for (const thread of active.threads.values()) {
            if (await Promise.resolve(threadFunc(thread))) {
                return thread;
            }
        }

        let before: string | undefined;
        let batch: FetchedThreadsMore;

        do {
            batch = await forum.threads.fetchArchived({
                type: "public",
                fetchAll: true,
                before,
                limit: 100
            });

            for (const thread of batch.threads.values()) {
                if (await Promise.resolve(threadFunc(thread))) {
                    return thread;
                }
            }

            before = batch.threads.last()?.id;
        } while (batch.hasMore);

        return null;
    }

    /**
     * Finds a guild member by name
     * @param guild Guild to search
     * @param name Name of member
     * @returns The found GuildMember, or null if none can be found within the given Guild
     */
    public async findMemberByName(guild: Guild, name: string) {
        let result = guild.members.cache.find((m) => m.nickname === name || m.displayName === name);
        if (!result) {
            const fetched = await guild.members.fetch({ query: name, limit: 1 });
            result = fetched.first();
        }
        return result || null;
    }

    /**
     * Finds a guild member or user by Discord ID
     * Checks the guild first (to capture nickname), falls back to global user lookup
     * @param guild Guild to search first
     * @param id Discord user ID
     * @returns GuildMember if found in guild, APIUser if found globally, null if not found
     */
    public async findMemberOrUserById(guild: Guild, id: string): Promise<GuildMember | User | null> {
        try {
            return await guild.members.fetch(id);
        } catch {
        // Not in guild, fall back to global user lookup
        }

        try {
            return await guild.client.users.fetch(id);
        } catch {
            return null;
        }
    }

    /**
     * Finds a guild role by name
     * @param guild Guild to search
     * @param name Name of role
     * @returns The found Role, or null if none can be found within the given Guild
     */
    public async findRoleByName(guild: Guild, name: string) {
        let result = guild.roles.cache.find((r) => r.name === name);
        if (!result) {
            const fetched = await guild.roles.fetch();
            result = fetched.find((r) => r.name === name);
        }
        return result || null;
    }

    /**
     * Finds a guild role by id
     * @param guild Guild to search
     * @param id Id of role
     * @returns The found Role, or null if none can be found within the given Guild
     */
    public async findRoleById(guild: Guild, id: string) {
        let result = guild.roles.cache.find((r) => r.id === id);
        if (!result) {
            const fetched = await guild.roles.fetch();
            result = fetched.find((r) => r.id === id);
        }
        return result || null;
    }

    public async getUserFromId(guild: Guild, discordId: string) {
        const member = await this.findMemberOrUserById(guild, discordId);
        const user = await DiscordService.syncUser(member);
        return user;
    }

    static async syncUser(member: APIGuildMember | GuildMember | APIUser | User, loggingIn: boolean = false) {
        const isUser = "username" in member && !("user" in member);
        const discordUser = isUser ? member as APIUser : (member as APIGuildMember | GuildMember).user;

        // Do not sync bots
        if (discordUser.bot) return;

        const nickname = !isUser
            ? ((member as APIGuildMember).nick ?? (member as GuildMember).nickname ?? null)
            : null;

        const [existing] = await dataService.users.read({ discordId: discordUser.id });

        let roles: AppRole[] = existing?.roles ?? [];
        if (!isUser) {
            const guildMember = member as GuildMember | APIGuildMember;
            const roleIds = guildMember instanceof GuildMember
                ? [...guildMember.roles.cache.keys()]
                : guildMember.roles;

            roles = roleIds.length > 0
                ? await dataService.roles.read(roleIds.map((id) => ({ discordId: id })))
                : [];
        }

        return await dataService.users.update({
            id: discordUser.id,
            discordId: discordUser.id,
            username: discordUser.username,
            displayname: nickname ?? discordUser.username,
            avatarUrl: `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`,
            permissions: existing?.permissions ?? [],
            roles,
            lastLogin: loggingIn ? new Date() : existing?.lastLogin
        });
    }

    static async syncRole(role: Role) {
        const [existing] = await dataService.roles.read({ discordId: role.id });
        const updated = await dataService.roles.update({
            discordId: role.id,
            active: true,
            name: role.name,
            color: role.colors.primaryColor,
            position: role.position,
            hoist: role.hoist,
            icon: role.icon,
            unicodeEmoji: role.unicodeEmoji,
            permissions: existing?.permissions ?? []
        });
        await dataService.users.syncEmbeddedRole(updated);
        return updated;
    }

    private async syncAll() {
        try {
            const guild = await this.getGuild();

            const [members, roles] = await Promise.all([
                guild.members.fetch(),
                guild.roles.fetch()
            ]);

            // Roles must be synced before users so embedded role objects are fresh
            await Promise.all(roles.map((r) => DiscordService.syncRole(r)));
            await Promise.all(members.map((m) => DiscordService.syncUser(m)));

            logger.info("[Discord] Daily sync complete");
        } catch (err) {
            logger.error("[Discord] Daily sync failed", err);
        }
    }
}

export default DiscordService;