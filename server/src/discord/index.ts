import { buildCommands, deployCommands } from "./deployCommands";
import { commands } from "./commands";
import { registerEvents } from "./events";
import { dataService, logger } from "@/services";
import {
    Client,
    ForumChannel,
    Guild,
    ThreadChannel,
    Events,
    FetchedThreadsMore,
    APIGuildMember,
    GuildMember,
    APIUser,
    User,
    Role,
    Partials,
    MessagePayload,
    MessageCreateOptions
} from "discord.js";
import { PLAYTESTING_TEAM_ROLE_NAME, Role as AppRole } from "common/models/auth";
import { discordCommandMiddleware, internalContextMiddleware } from "@/middleware/auth";
import cron from "node-cron";
import { isEnvironment } from "@/env";

/** Emoji are stored per guild, as the same name carries a different id in each */
function emojiKey(guildId: string) {
    return `discord:emojis:${guildId}`;
}

// Redis is the record; this only saves re-reading it for every line of a message being built
const EMOJI_CACHE_MS = 60_000;

class DiscordService {
    private client: Client;
    private guildId: string;
    private emojiCache = new Map<string, { emojis: Record<string, string>; at: number }>();
    constructor() {
        this.guildId = process.env.DISCORD_GUILD_ID;
        const token = process.env.DISCORD_TOKEN;
        const clientId = process.env.DISCORD_CLIENT_ID;

        this.client = new Client({
            // GuildExpressions is what keeps the emoji cache live; without it emojis are only ever
            // as current as the last full sync
            intents: [
                "Guilds",
                "GuildMessages",
                "DirectMessages",
                "GuildPresences",
                "GuildMembers",
                "GuildExpressions"
            ],
            partials: [Partials.Message, Partials.Channel],
            allowedMentions: { parse: ["users", "roles"], repliedUser: true }
        });

        this.client.once(Events.ClientReady, async (client) => {
            logger.info(`Discord connected with ${client.user.tag}`);

            await this.validateRequiredRoles();

            // Syncs necessary data once on startup, then once a day
            logger.info("[Discord] Running daily sync...");
            this.syncAll();
            if (isEnvironment("staging", "production")) {
                cron.schedule("0 0 * * *", () => this.syncAll());
                logger.info("[Discord] Daily sync scheduled");
            }
        });

        // Deploys slash commands to the guild on join or availability.
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

        registerEvents(this.client, this.guildId, DiscordService.syncUser, DiscordService.syncRole, (guild) =>
            this.syncEmojis(guild)
        );

        // Routes slash commands and autocomplete interactions to the appropriate command handler.
        this.client.on(Events.InteractionCreate, async (interaction) => {
            try {
                if (interaction.inGuild() && !this.isGuild(interaction.guild)) {
                    return;
                }
                if (interaction.isCommand() || interaction.isAutocomplete()) {
                    // DM commands carry no guild or member, so the user themselves is the principal
                    await discordCommandMiddleware(interaction.member ?? interaction.user, async () => {
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

    // Records every custom emoji the guild owns, so no id is hardcoded. Stored per guild, as the same
    // emoji in two guilds carries two ids and a flat map would serve one guild the other's
    public async syncEmojis(guild: Guild) {
        const emojis = await guild.emojis.fetch();
        const stored: Record<string, string> = {};
        for (const emoji of emojis.values()) {
            if (emoji.name) {
                stored[emoji.name.toLowerCase()] = emoji.toString();
            }
        }

        await dataService.redis.set(emojiKey(guild.id), JSON.stringify(stored));
        this.emojiCache.delete(guild.id);
        logger.info(`[Discord] Loaded ${Object.keys(stored).length} emojis from ${guild.name} (${guild.id})`);
        return stored;
    }

    // The guild's emoji by name - an icon and its emoji match by name alone, so a mismatch is fixed by
    // renaming in Discord. An unsynced guild returns nothing, which every caller falls back from
    public async getEmojiMap(guildId: string = this.guildId): Promise<Record<string, string>> {
        const cached = this.emojiCache.get(guildId);
        if (cached && Date.now() - cached.at < EMOJI_CACHE_MS) {
            return cached.emojis;
        }

        let emojis: Record<string, string> = {};
        try {
            const raw = await dataService.redis.get(emojiKey(guildId));
            emojis = raw ? JSON.parse(String(raw)) : {};
        } catch (err) {
            logger.warn(new Error(`[Discord] Failed to read emojis for guild ${guildId}`, { cause: err }));
        }

        this.emojiCache.set(guildId, { emojis, at: Date.now() });
        return emojis;
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
    public async findForumThread(
        forum: ForumChannel,
        threadFunc: (thread: ThreadChannel) => Promise<boolean> | boolean
    ) {
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
     * Sends a direct message to a user
     * @param discordId Discord user ID to message
     * @param payload Message payload to send, in the same shape a channel send accepts
     * @returns True if the message was delivered, false if the user is unreachable or has DMs closed
     */
    public async sendDirectMessage(discordId: string, payload: MessagePayload | MessageCreateOptions) {
        try {
            const guild = await this.getGuild();
            const member = await this.findMemberOrUserById(guild, discordId);
            if (!member) {
                return false;
            }
            await member.send(payload);
            return true;
        } catch {
            return false;
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
        const result = await DiscordService.syncUser(member);
        return result?.user;
    }

    /**
     * Syncs a discord member/user to our stored User record.
     * Also reports transitions useful for onboarding purposes: whether this is the user's first ever
     * login to the site, and which role names (if any) they gained since the last sync.
     */
    static async syncUser(member: APIGuildMember | GuildMember | APIUser | User, loggingIn: boolean = false) {
        const isUser = "username" in member && !("user" in member);
        const discordUser = isUser ? (member as APIUser | User) : (member as APIGuildMember | GuildMember).user;

        // Do not sync if user is missing or a bot
        if (!discordUser || discordUser.bot) return undefined;

        const nickname = !isUser ? ((member as APIGuildMember).nick ?? (member as GuildMember).nickname ?? null) : null;

        const displayname = discordUser instanceof User ? discordUser.globalName : (discordUser.global_name ?? null);

        const [existing] = await dataService.users.read({ discordId: discordUser.id });

        let roles: AppRole[] = existing?.roles ?? [];
        if (!isUser) {
            const guildMember = member as GuildMember | APIGuildMember;
            const roleIds =
                guildMember instanceof GuildMember ? [...guildMember.roles.cache.keys()] : guildMember.roles;

            roles = await dataService.roles.read([...roleIds.map((id) => ({ discordId: id })), { name: "@everyone" }]);
        }

        const previousRoleNames = new Set((existing?.roles ?? []).map((role) => role.name));
        const rolesGained = roles.filter((role) => !previousRoleNames.has(role.name)).map((role) => role.name);

        // Roles are the only field here which moves who may submit a check; without this every login syncs
        const currentRoleIds = new Set(roles.map((role) => role.discordId));
        const previousRoleIds = new Set((existing?.roles ?? []).map((role) => role.discordId));
        const rolesChanged =
            currentRoleIds.size !== previousRoleIds.size || [...currentRoleIds].some((id) => !previousRoleIds.has(id));

        const user = await dataService.users.update(
            {
                id: discordUser.id,
                discordId: discordUser.id,
                username: discordUser.username,
                displayname: nickname ?? displayname ?? discordUser.username,
                avatarUrl: discordUser.avatar
                    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
                    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordUser.id) >> 22n) % 6}.png`,
                permissions: existing?.permissions ?? [],
                roles,
                lastLogin: loggingIn ? new Date() : existing?.lastLogin
            },
            true,
            rolesChanged
        );

        return {
            user,
            isFirstLogin: loggingIn && !existing?.lastLogin,
            rolesGained
        };
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

    private async validateRequiredRoles() {
        try {
            const guild = await this.getGuild();
            const roles = await guild.roles.fetch();

            const requiredRoles = ["@everyone", PLAYTESTING_TEAM_ROLE_NAME];
            for (const name of requiredRoles) {
                if (!roles.find((r) => r.name === name)) {
                    logger.warn(`[Discord] Required role "${name}" is missing from the guild`);
                }
            }
        } catch (err) {
            logger.error("[Discord] Failed to validate required roles", err);
        }
    }

    public async assignPlaytestingTeamRole(discordId: string): Promise<GuildMember | null> {
        const guild = await this.getGuild();

        let member: GuildMember;
        try {
            member = await guild.members.fetch(discordId);
        } catch {
            return null;
        }

        const role = await this.findRoleByName(guild, PLAYTESTING_TEAM_ROLE_NAME);
        if (!role) {
            throw new Error(`${PLAYTESTING_TEAM_ROLE_NAME} role not found in guild`);
        }

        await member.roles.add(role);
        return member;
    }

    private async syncAll() {
        try {
            await internalContextMiddleware(async () => {
                const guild = await this.getGuild();

                const [members, roles] = await Promise.all([guild.members.fetch(), guild.roles.fetch()]);
                await Promise.all(roles.map((r) => DiscordService.syncRole(r)));
                await Promise.all(members.map((m) => DiscordService.syncUser(m)));
                await this.syncEmojis(guild);
            });

            logger.info("[Discord] Daily sync complete");
        } catch (err) {
            logger.error("[Discord] Daily sync failed", err);
        }
    }
}

export default DiscordService;
