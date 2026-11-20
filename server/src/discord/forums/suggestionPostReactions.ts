import { Message, MessageReaction, PartialMessageReaction, PartialUser, User } from "discord.js";
import { keyedMutex } from "@/concurrency";
import { dataService, logger } from "@/services";
import { ICardSuggestion, ReactionType, suggestionReactionBlockReason } from "common/models/cards";
import Permission from "common/models/permissions";
import { buildComponents, fetchThread, suggestionImageFilename } from "./suggestionForum";
import { DISCORD_FETCH_LIMIT } from "./legacySuggestionThreads";
import { suggestionReactionOf } from "../utils";

// People react to a suggestion's post rather than pressing its buttons, so a like or dislike emoji there is moved
// onto the suggestion and taken off the post. Every other emoji is an ordinary reaction and is left alone.

type Votes = Map<string, { types: Set<ReactionType>; reactions: MessageReaction[] }>;

const reactionLock = keyedMutex<ICardSuggestion>((suggestion) => `suggestion-post-reactions|${suggestion.id}`);

function isActive(suggestion: ICardSuggestion) {
    return !suggestion.draft && !suggestion.archived && !!suggestion._metadata?.discord?.messageUrl;
}

async function fetchReactors(reaction: MessageReaction) {
    const reactors: string[] = [];
    let after: string | undefined;
    for (;;) {
        const users = await reaction.users.fetch({ limit: DISCORD_FETCH_LIMIT, after });
        reactors.push(...users.filter((user) => !user.bot).map((user) => user.id));
        if (users.size < DISCORD_FETCH_LIMIT) {
            return reactors;
        }
        after = users.lastKey();
    }
}

/** Moves every 👍/👎 on a suggestion's post onto the suggestion. A vote is only recorded once its emoji has been removed,
 *  so one which can't be removed is never applied again over a later change. Someone who gave both is recorded as
 *  neither, and one the suggestion would refuse (their own, or without READ_SUGGESTIONS) is removed without a record. */
async function moveSuggestionPostReactions(suggestion: ICardSuggestion, readers: Set<string>) {
    await reactionLock(suggestion).runExclusive(async () => {
        const thread = await fetchThread(suggestion._metadata!.discord!.messageUrl!);
        const starter = await thread?.fetchStarterMessage({ force: true }).catch(() => null);
        if (!thread || !starter) {
            return;
        }

        const votes: Votes = new Map();
        for (const reaction of starter.reactions.cache.values()) {
            const type = suggestionReactionOf(reaction.emoji.name);
            if (!type) {
                continue;
            }
            for (const userId of await fetchReactors(reaction)) {
                const vote = votes.get(userId) ?? { types: new Set(), reactions: [] };
                vote.types.add(type);
                vote.reactions.push(reaction);
                votes.set(userId, vote);
            }
        }
        if (votes.size === 0) {
            return;
        }

        const wasArchived = thread.archived;
        if (wasArchived) {
            await thread.setArchived(false);
        }

        try {
            await recordVotes(suggestion, votes, readers, starter);
        } finally {
            if (wasArchived) {
                await thread.setArchived(true);
            }
        }
    });
}

async function recordVotes(suggestion: ICardSuggestion, votes: Votes, readers: Set<string>, starter: Message) {
    let updated: ICardSuggestion | undefined;
    for (const [userId, { types, reactions }] of votes) {
        try {
            await Promise.all(reactions.map((reaction) => reaction.users.remove(userId)));
        } catch (err) {
            logger.warn(
                new Error(
                    `[Discord] Failed to remove a reaction from the post of suggestion "${suggestion.card.name}" (${suggestion.id}) - does the bot have Manage Messages?`,
                    { cause: err }
                )
            );
            continue;
        }

        const [type] = types;
        const current = (updated ?? suggestion)._metadata?.engagement?.reactions?.[userId]?.type;
        const isAllowed = readers.has(userId) && !suggestionReactionBlockReason(suggestion, userId);
        if (types.size === 1 && isAllowed && current !== type) {
            updated = (await dataService.suggestions.react(suggestion.id!, userId, type, false)) ?? updated;
        }
    }

    if (updated) {
        await starter.edit({ components: await buildComponents(updated, suggestionImageFilename(updated)) });
        logger.info(`[Discord] Moved post reactions onto suggestion "${suggestion.card.name}" (${suggestion.id})`);
    }
}

export async function onSuggestionPostReactionAdded(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
) {
    const { message } = reaction;
    // A thread's starter message shares the thread's id. Its channel is not checked here, as an uncached thread
    // arrives without one - the suggestion found by its url is what says it is a suggestion's post
    const isStarter = message.id === message.channelId;
    if (user.bot || !isStarter || !suggestionReactionOf(reaction.emoji.name)) {
        return;
    }

    const [suggestion] = await dataService.suggestions.read({ _metadata: { discord: { messageUrl: message.url } } });
    if (!suggestion || !isActive(suggestion)) {
        return;
    }
    const readers = await dataService.users.findIdsByPermission(Permission.READ_SUGGESTIONS);
    await moveSuggestionPostReactions(suggestion, readers);
}

/** Catches up on every post, including reactions given while the bot was away. One post at a time, as this runs in the
 *  background and would otherwise queue hundreds of requests at once */
export async function moveAllSuggestionPostReactions() {
    const [suggestions, readers] = await Promise.all([
        dataService.suggestions.read({ draft: false, archived: { $exists: false } }),
        dataService.users.findIdsByPermission(Permission.READ_SUGGESTIONS)
    ]);
    for (const suggestion of suggestions.filter(isActive)) {
        try {
            await moveSuggestionPostReactions(suggestion, readers);
        } catch (err) {
            logger.warn(
                new Error(
                    `[Discord] Failed to move post reactions for suggestion "${suggestion.card.name}" (${suggestion.id})`,
                    { cause: err }
                )
            );
        }
    }
}
