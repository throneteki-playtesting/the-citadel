import { Client, GatewayIntentBits, GuildMember, Guild } from "discord.js";
import { log } from "./logger";

let client: Client | null = null;
let membersCache: GuildMember[] | null = null;

export async function getDiscordClient(): Promise<Client> {
    if (client?.isReady()) return client;

    client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

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
    let match = members.find(m => m.nickname?.toLowerCase() === normalised);
    if (match) {
        log.verbose(`"${username}" matched on guild nickname`);
        return match.user.id;
    }

    // 2. Global display name set on their profile
    match = members.find(m => m.user.displayName?.toLowerCase() === normalised);
    if (match) {
        log.verbose(`"${username}" matched on display name`);
        return match.user.id;
    }

    // 3. Unique username handle (e.g. "john_doe")
    match = members.find(m => m.user.username.toLowerCase() === normalised);
    if (match) {
        log.verbose(`"${username}" matched on username`);
        return match.user.id;
    }

    return null;
}