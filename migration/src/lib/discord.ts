import {
    Client,
    FetchedThreadsMore,
    ForumChannel,
    GatewayIntentBits,
    GuildMember,
    Guild,
    Message,
    TextChannel
} from "discord.js";
import { log } from "./logger";

let client: Client | null = null;
let membersCache: GuildMember[] | null = null;

export async function getDiscordClient(): Promise<Client> {
    if (client?.isReady()) return client;

    client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent]
    });

    await new Promise<void>((resolve, reject) => {
        client!.once("ready", () => {
            log.success(`Discord client ready (${client!.user?.tag})`);
            resolve();
        });
        client!.once("error", reject);
        client!.login(process.env.DISCORD_TOKEN as string).catch(reject);
    });

    return client;
}

export async function destroyDiscordClient(): Promise<void> {
    if (client) {
        await client.destroy();
        client = null;
        membersCache = null;
    }
}

async function getGuild(discord: Client): Promise<Guild> {
    const guildId = process.env.DISCORD_GUILD_ID as string;

    const cached = discord.guilds.cache.get(guildId);
    if (cached) return cached;

    return discord.guilds.fetch({ guild: guildId, withCounts: false });
}

// Fetches all members of the configured guild (handles pagination automatically via GuildMembers intent).
export async function fetchAllGuildMembers(): Promise<GuildMember[]> {
    if (membersCache) return membersCache;

    const discord = await getDiscordClient();
    const guild = await getGuild(discord);

    const memberCollection = await guild.members.fetch();
    membersCache = [...memberCollection.values()];
    log.info(`Fetched ${membersCache.length} members from guild "${guild.name}"`);
    return membersCache;
}

// Resolve a username string to a Discord user ID.
// Matching priority:
//   1. Guild nickname (server-specific, most likely to match review-era names)
//   2. Global display name (profile-level display name)
//   3. Username (the unique @handle)
export async function resolveUsernameToId(username: string): Promise<string | null> {
    const members = await fetchAllGuildMembers();
    const normalised = username.toLowerCase();

    // 1. Guild-specific nickname
    let match = members.find((m) => m.nickname?.toLowerCase() === normalised);
    if (match) {
        log.verbose(`"${username}" matched on guild nickname`);
        return match.user.id;
    }

    // 2. Global display name set on their profile
    match = members.find((m) => m.user.displayName?.toLowerCase() === normalised);
    if (match) {
        log.verbose(`"${username}" matched on display name`);
        return match.user.id;
    }

    // 3. Unique username handle (e.g. "john_doe")
    match = members.find((m) => m.user.username.toLowerCase() === normalised);
    if (match) {
        log.verbose(`"${username}" matched on username`);
        return match.user.id;
    }

    return null;
}

export interface ForumThread {
    url: string;
    createdAt: Date;
}

/**
 * Returns all possible display names for a Discord user ID, in priority order:
 * guild nickname → global display name → username.
 * Requires fetchAllGuildMembers() to have been called first.
 */
export function getDisplayNamesFor(discordId: string): string[] {
    if (!membersCache) return [];
    const member = membersCache.find((m) => m.user.id === discordId);
    if (!member) return [];
    const names: string[] = [];
    if (member.nickname) names.push(member.nickname);
    if (member.user.displayName && member.user.displayName !== member.nickname) names.push(member.user.displayName);
    names.push(member.user.username);
    return names;
}

/**
 * Fetches all threads from a named forum channel and returns a map of
 * thread name → { url, createdAt }. The starter message URL is computable as
 * channels/{guildId}/{threadId}/{threadId} without an extra API call per thread.
 */
export async function fetchForumThreads(forumName: string): Promise<Map<string, ForumThread>> {
    const discord = await getDiscordClient();
    const guild = await getGuild(discord);
    const guildId = guild.id;

    const channels = await guild.channels.fetch();
    const channel = channels.find((c) => c?.name?.endsWith(forumName));
    if (!channel) {
        throw new Error(`Forum channel "${forumName}" not found in guild "${guild.name}"`);
    }
    if (!channel.isThreadOnly()) {
        throw new Error(`Channel "${forumName}" is not a forum channel`);
    }

    const forum = channel as ForumChannel;
    const threadMap = new Map<string, ForumThread>();

    const active = await forum.threads.fetchActive();
    for (const thread of active.threads.values()) {
        threadMap.set(thread.name, {
            url: `https://discord.com/channels/${guildId}/${thread.id}/${thread.id}`,
            createdAt: thread.createdAt ?? new Date()
        });
    }
    log.verbose(`${active.threads.size} active thread(s) loaded from "${forumName}"`);

    let before: string | undefined;
    let batch: FetchedThreadsMore;
    let archivedCount = 0;
    do {
        batch = await forum.threads.fetchArchived({ type: "public", fetchAll: true, before, limit: 100 });
        for (const thread of batch.threads.values()) {
            threadMap.set(thread.name, {
                url: `https://discord.com/channels/${guildId}/${thread.id}/${thread.id}`,
                createdAt: thread.createdAt ?? new Date()
            });
        }
        archivedCount += batch.threads.size;
        before = batch.threads.last()?.id;
    } while (batch.hasMore);
    log.verbose(`${archivedCount} archived thread(s) loaded from "${forumName}"`);

    return threadMap;
}

export async function fetchCardForumThreads(): Promise<Map<string, ForumThread>> {
    return fetchForumThreads("card-forum");
}

export interface ChannelMessage {
    firstLine: string;
    url: string;
}

// Components V2 posts carry no content, so the embed is used as a fallback for the searchable line
function firstLineOf(message: Message): string {
    const text = message.content || message.embeds[0]?.title || message.embeds[0]?.description || "";
    return (
        text
            .split("\n")
            .find((line) => line.trim().length > 0)
            ?.trim() ?? ""
    );
}

// Reads the full history of a named text channel; read-only, as the migration never posts or edits
export async function fetchChannelMessages(channelName: string): Promise<ChannelMessage[]> {
    const discord = await getDiscordClient();
    const guild = await getGuild(discord);

    const channels = await guild.channels.fetch();
    const channel = channels.find((c) => c?.isTextBased() && !c.isThread() && c.name.includes(channelName));
    if (!channel) {
        log.warn(`Text channel "${channelName}" not found in guild "${guild.name}"`);
        return [];
    }

    const messages: ChannelMessage[] = [];
    let before: string | undefined;

    for (;;) {
        const batch = await (channel as TextChannel).messages.fetch({ limit: 100, before });
        if (batch.size === 0) {
            break;
        }
        for (const message of batch.values()) {
            messages.push({ firstLine: firstLineOf(message), url: message.url });
        }
        before = batch.last()?.id;
    }

    log.verbose(`${messages.length} message(s) loaded from "${channelName}"`);
    return messages;
}
