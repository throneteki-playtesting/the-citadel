import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    DiscordAPIError,
    ForumChannel,
    MessageFlags,
    resolveColor,
    RESTJSONErrorCodes,
    TextDisplayBuilder,
    ThreadChannel
} from "discord.js";
import { Faction, factions, ICard, Type, types } from "common/models/cards";
import { factionNames, normaliseCardName, typeNames } from "common/utils";
import { dataService, discordService, logger } from "@/services";
import { FORUM_NAME, isSuggestionForumThread } from "./suggestionForum";
import { colors } from "../utils";

// Threads designers opened in the suggestion forum by hand, before the Citadel managed suggestion threads.
// Migrating one carries its date and 👍s to a suggestion with a thread of its own, and closes the old one.

/** What a migration needs to know about an old thread - its tags read as a faction and card type */
export interface LegacyThread {
    id: string;
    url: string;
    name: string;
    createdAt: Date;
    ownerId: string;
    faction?: Faction;
    type?: Type;
}

const LIKE_EMOJI = "👍";
// Discord's own cap on the items a single reaction or archived-thread fetch returns
const DISCORD_FETCH_LIMIT = 100;

async function getSuggestionForum(): Promise<ForumChannel> {
    const guild = await discordService.getGuild();
    const channels = await guild.channels.fetch();
    const forum = channels.find((channel) => channel instanceof ForumChannel && channel.name.endsWith(FORUM_NAME));
    if (!forum) {
        throw new Error(`"${FORUM_NAME}" channel does not exist or is not a forum`);
    }
    return forum as ForumChannel;
}

/** A thread of the suggestion forum, or undefined when the id is anything else (or nothing at all) */
export async function fetchSuggestionForumThread(threadId: string): Promise<ThreadChannel | undefined> {
    const guild = await discordService.getGuild();
    try {
        const channel = await guild.channels.fetch(threadId);
        if (!isSuggestionForumThread(channel)) {
            return undefined;
        }
        return channel;
    } catch (err) {
        if (
            err instanceof DiscordAPIError &&
            (err.code === RESTJSONErrorCodes.UnknownChannel || err.code === RESTJSONErrorCodes.MissingAccess)
        ) {
            return undefined;
        }
        throw err;
    }
}

/** A thread migrates once - after that a suggestion holds its url as `legacyUrl` */
export async function isThreadMigrated(threadUrl: string) {
    return (await dataService.suggestions.count({ _metadata: { discord: { legacyUrl: threadUrl } } })) > 0;
}

export function describeLegacyThread(thread: ThreadChannel): LegacyThread {
    const tagNames = (thread.parent as ForumChannel | null)?.availableTags
        .filter((tag) => thread.appliedTags.includes(tag.id))
        .map((tag) => tag.name);
    return {
        id: thread.id,
        url: thread.url,
        name: thread.name,
        createdAt: thread.createdAt ?? new Date(),
        ownerId: thread.ownerId ?? "",
        faction: factions.find((faction) => tagNames?.includes(factionNames[faction])),
        type: types.find((type) => tagNames?.includes(typeNames[type]))
    };
}

/** Whether an old thread looks like it was about this card - its title containing the card's name, and a
 *  faction or type tag, where the thread carries one, agreeing. A tag left off matches anything. */
export function threadMatchesCard(thread: Pick<LegacyThread, "name" | "faction" | "type">, card: Partial<ICard>) {
    if (!card.name || !normaliseCardName(thread.name).includes(normaliseCardName(card.name))) {
        return false;
    }
    return (!thread.faction || thread.faction === card.faction) && (!thread.type || thread.type === card.type);
}

/** Every user who gave the thread's opening post a 👍 (any skin tone) - bots and the thread's own
 *  author left out, since designers could like their own posts in the forum but not in the Citadel */
export async function fetchThreadLikes(thread: ThreadChannel): Promise<string[]> {
    const starter = await thread.fetchStarterMessage().catch(() => null);
    if (!starter) {
        return [];
    }
    const likers = new Set<string>();
    for (const reaction of starter.reactions.cache.values()) {
        if (!reaction.emoji.name?.startsWith(LIKE_EMOJI)) {
            continue;
        }
        let after: string | undefined;
        for (;;) {
            const users = await reaction.users.fetch({ limit: DISCORD_FETCH_LIMIT, after });
            for (const user of users.values()) {
                if (!user.bot && user.id !== thread.ownerId) {
                    likers.add(user.id);
                }
            }
            if (users.size < DISCORD_FETCH_LIMIT) {
                break;
            }
            after = users.lastKey();
        }
    }
    return [...likers];
}

/** Every thread in the suggestion forum a user opened themselves, archived ones included */
export async function fetchThreadsStartedBy(ownerId: string): Promise<ThreadChannel[]> {
    const forum = await getSuggestionForum();
    const threads = [...(await forum.threads.fetchActive()).threads.values()];

    let before: string | undefined;
    for (;;) {
        const page = await forum.threads.fetchArchived({ before, limit: DISCORD_FETCH_LIMIT });
        threads.push(...page.threads.values());
        if (!page.hasMore || page.threads.size === 0) {
            break;
        }
        before = page.threads.last()?.id;
    }
    return threads.filter((thread) => thread.ownerId === ownerId);
}

/** Says where the suggestion now lives, then locks and archives the old thread. Never throws - it runs before
 *  the new thread is recorded, so failing here would have the next sync post a second one. */
export async function closeLegacyThread(legacyUrl: string, newThreadUrl: string) {
    try {
        // A thread url ends in the thread id itself - there is no message id after it to parse around
        const [, threadId] = legacyUrl.match(/(\d+)$/) ?? [];
        const thread = threadId ? await fetchSuggestionForumThread(threadId) : undefined;
        if (!thread || thread.locked) {
            return;
        }
        if (thread.archived) {
            await thread.setArchived(false);
        }
        const note = new ContainerBuilder()
            .setAccentColor(resolveColor(colors.citadel))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    "### 🐦‍⬛ This suggestion has moved to the Citadel\n" +
                        "It carries on in a new thread, with this one's date and likes. This thread stays as it was, " +
                        "for its history - but is now closed."
                )
            )
            .addActionRowComponents(
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setLabel("Go to the new thread").setURL(newThreadUrl).setStyle(ButtonStyle.Link)
                )
            );
        await thread.send({
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] },
            components: [note]
        });
        await thread.setLocked(true);
        await thread.setArchived(true);
    } catch (err) {
        logger.warn(new Error(`[Discord] Failed to fully close legacy suggestion thread ${legacyUrl}`, { cause: err }));
    }
}
