import { buildCommands, deployCommands } from "./deployCommands";
import { commands } from "./commands";
import { dataService, logger } from "@/services";
import { Client, ForumChannel, Guild, ThreadChannel, Events, FetchedThreadsMore, APIGuildMember, GuildMember } from "discord.js";
import { discordCommandMiddleware } from "@/middleware/auth";

class DiscordService {
    private client: Client;
    private guildId: string;
    constructor() {
        this.guildId = process.env.DISCORD_GUILD_ID;
        const token = process.env.DISCORD_TOKEN;
        const clientId = process.env.DISCORD_CLIENT_ID;

        this.client = new Client({
            intents: ["Guilds", "GuildMessages", "DirectMessages", "GuildPresences"],
            allowedMentions: { parse: ["users", "roles"], repliedUser: true }
        });

        this.client.once(Events.ClientReady, (client) => {
            logger.info(`Discord connected with ${client.user.tag}`);
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

    static async getUserFromMember(member: APIGuildMember | GuildMember) {
        const discordUser = member.user;

        let [user] = await dataService.users.read({ discordId: discordUser.id });
        const nickname = discordUser["nick"] ?? discordUser["nickname"];
        if (!user) {
            user = {
                id: discordUser.id,
                discordId: discordUser.id,
                username: discordUser.username,
                displayname: nickname ?? discordUser.username,
                avatarUrl: `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`,
                permissions: [],
                roles: [],
                lastLogin: new Date()
            };
        } else {
            user.username = discordUser.username;
            user.displayname = nickname ?? discordUser.username;
            user.avatarUrl = `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`;
            user.lastLogin = new Date();
        }
        await dataService.users.update(user);

        return user;
    }

}

export default DiscordService;