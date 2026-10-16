import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    DiscordAPIError,
    ForumChannel,
    Guild,
    GuildForumTag,
    GuildForumThreadMessageCreateOptions,
    RateLimitError,
    RESTJSONErrorCodes,
    ThreadChannel,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    Message,
    MessageEditOptions,
    MessageFlags,
    resolveColor,
    Role,
    TextDisplayBuilder
} from "discord.js";
import { labelEmojis, colors, extractFromURL, TEXT_DISPLAY_MAX, unicodeEmojis } from "../utils";
import { toDiscord } from "common/richText/toDiscord";
import { truncateHtml } from "common/richText/truncate";
import { dataService, discordService, logger } from "@/services";
import { IPlaytestCard } from "common/models/cards";
import { previewUrlOf } from "common/models/slots";
import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { factionNames, isInitial, isPreview } from "common/utils";
import { getTimeLockedImageUrl, syncImage } from "@/rendering/hosting";
import { capitalize, merge, omit } from "lodash-es";
import { createSyncEmitter } from "@/services/sseService";
import { byCard, cardLock, orderedStep, syncBatch } from "@/concurrency";
import { Mutex } from "async-mutex";

const syncCardForumMutex = new Mutex();

/**
 * Creates any new threads & messages for cards which are missing their discordMessageUrl, and refreshes
 * the message content in place for cards which already have one.
 * @param cards Cards to sync
 */
export async function syncCardForum(cards: IPlaytestCard[], forced?: boolean): Promise<IPlaytestCard[]> {
    return await syncBatch(cards, {
        emitterFor: (card) => createSyncEmitter("card", "discord", card),
        context: () => getCardForumContext(),
        key: cardLock,
        order: byCard,
        work: (card, context, emitter) => syncCardThread(card, context, emitter, forced)
    });
}

async function syncCardThread(
    card: IPlaytestCard,
    context: CardForumContext | undefined,
    emitter: ReturnType<typeof createSyncEmitter<"card">>,
    forced: boolean = false
): Promise<IPlaytestCard> {
    try {
        context = context ?? (await getCardForumContext());
        if (forced || isMessageOutdated(card)) {
            // Drafts & Regular releases are treated differently:
            // - Draft posts a new message per revision (striking the old one) once actually outdated; a forced
            //   sync which isn't outdated just refreshes the current message in place
            // - Regular owns a single thread starter message, which is always refreshed in place once it exists
            if (card.draft) {
                const draftMessageExists = !!card._metadata?.discord?.messageUrl;
                if (draftMessageExists && !isMessageOutdated(card)) {
                    // Forced but not outdated, and a message already exists - refresh it in place
                    emitter.progress("Refreshing Draft");
                    logger.info(`[Discord] Refreshing draft ${card.name} (${card.version})`);
                    card = await refreshDraft(card, context);
                } else if (draftMessageExists) {
                    // Outdated, and a message already exists - post a new one and strike the old
                    emitter.progress("Syncing Draft");
                    logger.info(`[Discord] Syncing draft ${card.name} (${card.version})`);
                    card = await updateDraft(card, context);
                } else {
                    // No message exists yet - post the first one
                    emitter.progress("Syncing Draft");
                    logger.info(`[Discord] Syncing draft ${card.name} (${card.version})`);
                    card = await newDraft(card, context);
                }
                logger.verbose(
                    `[Discord] Synced ${card.name} (${card.version}): ${card._metadata?.discord?.messageUrl}`
                );
            } else {
                const messageExists = !!card._metadata?.discord?.messageUrl;
                if (messageExists) {
                    // Forced or outdated, and a message already exists - refresh it in place, no new thread
                    emitter.progress("Refreshing");
                    logger.info(`[Discord] Refreshing ${card.name} (${card.version})`);
                    card = await refreshCardMessage(card, context);
                } else {
                    // No message exists yet - look for a legacy thread to adopt, else create a new one
                    emitter.progress("Searching");
                    logger.info(`[Discord] Syncing ${card.name} (${card.version})`);
                    const existingThread = await discordService.findForumThread(
                        context.channel,
                        (thread) => thread.name === threadNameFor(card)
                    );
                    if (existingThread) {
                        // For legacy reasons; if a thread exists before card._metadata.discord was created, we need to map it
                        const starter = await existingThread.fetchStarterMessage();
                        merge(card, { _metadata: { discord: { messageUrl: starter.url, lastSynced: new Date() } } });
                    } else {
                        emitter.progress("Syncing");
                        if (isPreview(card)) {
                            card = await createPreview(card, context);
                        } else if (isInitial(card)) {
                            card = await createInitial(card, context);
                        } else if (card.released) {
                            card = await createReleased(card, context);
                        } else {
                            card = await createNewLatest(card, context);
                        }
                    }
                }
                logger.verbose(
                    `[Discord] Synced ${card.name} (${card.version}): ${card._metadata?.discord?.messageUrl}`
                );
            }
            [card] = await dataService.cards.update([card], false, false, false);
        }
        emitter.complete(card);
    } catch (err) {
        emitter.error("Failure");
        logger.warn(new Error(`[Discord] Failed to sync ${card.name} (${card.version})`, { cause: err }));
    }
    return card;
}

function isMessageOutdated(card: IPlaytestCard) {
    return !card._metadata?.discord?.lastSynced || card.updated > card._metadata.discord.lastSynced;
}

// Discord refuses to convert an existing message to/from Components V2 in place
function isComponentsV2(message: Message) {
    return message.flags.has(MessageFlags.IsComponentsV2);
}

export async function createPreview(card: IPlaytestCard, context?: CardForumContext) {
    try {
        context = context ?? (await getCardForumContext());
        if (!card.draft) {
            throw new Error("Card is not draft");
        }
        card = await syncImage(card);

        const [project] = await dataService.projects.read({ number: card.project });
        const previewMessage = await messages.preview(card, project, context);
        const thread = await createThreadFor(card, previewMessage, context);

        // Pin the first message of the newly-created thread
        const starter = await thread.fetchStarterMessage();
        await starter.pin();

        merge(card, { _metadata: { discord: { messageUrl: starter.url, lastSynced: new Date() } } });
        return card;
    } catch (err) {
        throw new Error(`Error creating preview thread for ${card.name} (Preview)`, { cause: err });
    }
}

export async function createInitial(card: IPlaytestCard, context?: CardForumContext) {
    try {
        context = context ?? (await getCardForumContext());
        if (!card.latest) {
            throw new Error("Card is not latest");
        }
        card = await syncImage(card);

        const [project] = await dataService.projects.read({ number: card.project });
        const initialMessage = await messages.initial(card, project, context);
        const thread = await createThreadFor(card, initialMessage, context);

        // Pin the first message of the newly-created thread
        const starter = await thread.fetchStarterMessage();
        await starter.pin();

        const preview = await dataService.cards.previous(card);
        if (preview) {
            // Close preview thread, if it exists
            await closeThreadFor(preview, context);
        }
        await handOverPreview(card, starter.url, context);

        merge(card, { _metadata: { discord: { messageUrl: starter.url, lastSynced: new Date() } } });
        return card;
    } catch (err) {
        throw new Error(`Error creating initial thread for ${card.name} (${card.version})`, { cause: err });
    }
}

// A draft project's preview thread says where its card's initial thread is, then closes - the discussion stays
async function handOverPreview(card: IPlaytestCard, initialUrl: string, context: CardForumContext) {
    const previewUrl = card._metadata?.discord?.previewUrl;
    if (!previewUrl) {
        return;
    }
    try {
        const thread = await threadAt(previewUrl, context.guild);
        if (thread.archived) {
            await thread.setArchived(false);
        }
        await thread.send(
            previewNotice(card, `### Now in playtesting\nThe initial card has its own thread: ${initialUrl}`)
        );
        await lockAndArchive(thread, { ...card, latest: false }, context);
    } catch (err) {
        logger.warn(new Error(`[Discord] Failed to close the preview thread of ${card.name}`, { cause: err }));
    }
    delete card._metadata.discord.previewUrl;
}

export async function createNewLatest(card: IPlaytestCard, context?: CardForumContext) {
    try {
        context = context ?? (await getCardForumContext());
        if (!card.latest) {
            throw new Error("Card is not latest");
        }
        const playtestingUpdate = await dataService.playtestingUpdates.for(card);
        if (!playtestingUpdate) {
            throw new Error("No playtesting update exists for this card");
        }
        card = await syncImage(card);

        // Create new thread
        const [project] = await dataService.projects.read({ number: card.project });
        const latestMessage = await messages.newLatest(card, project, playtestingUpdate, context);
        const thread = await createThreadFor(card, latestMessage, context);

        // Pin the first message of the newly-created thread
        const starter = await thread.fetchStarterMessage();
        await starter.pin();

        const previous = await dataService.cards.previous(card);
        if (previous) {
            // Close previous thread, if it exists
            await closeThreadFor(previous, context);
        }

        merge(card, { _metadata: { discord: { messageUrl: starter.url, lastSynced: new Date() } } });
        return card;
    } catch (err) {
        throw new Error(`Error creating new latest thread for ${card.name} (${card.version})`, { cause: err });
    }
}

export async function createReleased(card: IPlaytestCard, context?: CardForumContext) {
    try {
        context = context ?? (await getCardForumContext());
        if (!card.latest) {
            throw new Error("Card is not latest");
        }
        if (!card.released) {
            throw new Error("Card is not released");
        }
        card = await syncImage(card);

        const [project] = await dataService.projects.read({ number: card.project });
        const releasedMessage = await messages.released(card, project);
        const thread = await createThreadFor(card, releasedMessage, context);

        // Pin the first message of the newly-created thread
        const starter = await thread.fetchStarterMessage();
        await starter.pin();

        const previous = await dataService.cards.previous(card);
        if (previous) {
            // Close previous thread, if it exists
            await closeThreadFor(previous, context);
        }

        merge(card, { _metadata: { discord: { messageUrl: starter.url, lastSynced: new Date() } } });
        return card;
    } catch (err) {
        throw new Error(`Error creating released thread for ${card.name} (${card.version})`, { cause: err });
    }
}

/** Regenerates and re-sends the given card's own starter message, in place - no thread/tag changes */
async function refreshCardMessage(card: IPlaytestCard, context: CardForumContext) {
    try {
        if (!card._metadata?.discord?.messageUrl) {
            throw new Error("Cannot refresh message of card as message url is missing");
        }
        card = await syncImage(card);

        const [project] = await dataService.projects.read({ number: card.project });
        let messageOptions: GuildForumThreadMessageCreateOptions;
        if (isPreview(card)) {
            messageOptions = await messages.preview(card, project, context);
        } else if (isInitial(card)) {
            messageOptions = await messages.initial(card, project, context);
        } else if (card.released) {
            messageOptions = await messages.released(card, project);
        } else {
            const playtestingUpdate = await dataService.playtestingUpdates.for(card);
            if (!playtestingUpdate) {
                throw new Error("No playtesting update exists for this card");
            }
            messageOptions = await messages.newLatest(card, project, playtestingUpdate, context);
        }

        const { channelId, messageId } = extractFromURL(card._metadata.discord.messageUrl);
        const channel = await context.guild.channels.fetch(channelId);
        if (!channel?.isThread()) {
            throw new Error(`Found channel is not a thread with id: ${channelId}`);
        }
        const message = await channel.messages.fetch(messageId);
        if (!isComponentsV2(message)) {
            logger.warn(
                `[Discord] Cannot refresh ${card.name} (${card.version}) in place - its message predates Components V2 and can't be converted; delete the thread to have it recreated`
            );
            return card;
        }
        await message.edit(messageOptions as MessageEditOptions);

        merge(card, { _metadata: { discord: { lastSynced: new Date() } } });
        return card;
    } catch (err) {
        throw new Error(`Error refreshing message for ${card.name} (${card.version})`, { cause: err });
    }
}

export async function newDraft(card: IPlaytestCard, context?: CardForumContext) {
    try {
        context = context ?? (await getCardForumContext());
        if (!card.draft) {
            throw new Error("Card is not in draft");
        }
        card = await syncImage(card);

        const { thread, threadCard: previous } = await getThreadFor(card);
        const draftMessage = await messages.newDraft(card, previous._metadata.discord.messageUrl, context);
        let message = await thread.send(draftMessage);
        // Bug: Found an issue where embed image sometimes does not show
        // Suspected to be Discord caching service failing when url is similar to existing
        // For now, simply means 1s delay on any of these - shame
        await new Promise((resolve) => setTimeout(resolve, 1000));
        message = await message.edit(draftMessage as MessageEditOptions);

        merge(card, { _metadata: { discord: { messageUrl: message.url, lastSynced: new Date() } } });
        return card;
    } catch (err) {
        throw new Error(`Error creating new draft message for ${card.name} (${card.version})`, { cause: err });
    }
}

export async function updateDraft(card: IPlaytestCard, context?: CardForumContext) {
    try {
        context = context ?? (await getCardForumContext());
        if (!card.draft) {
            throw new Error("Card is not in draft");
        }
        if (!card._metadata?.discord?.messageUrl) {
            throw new Error("Cannot edit message of draft card as message url is missing");
        }

        const { channelId, messageId } = extractFromURL(card._metadata.discord.messageUrl);
        const channel = await context.guild.channels.fetch(channelId);
        if (!channel.isThread()) {
            throw new Error(`Found channel is not a thread with id: ${channelId}`);
        }
        card = await syncImage(card);

        // Send update message to thread
        const { thread, threadCard: previous } = await getThreadFor(card);
        const draftMessage = await messages.newDraft(card, previous._metadata.discord.messageUrl, context);
        let message = await thread.send(draftMessage);
        // Bug: Found an issue where embed image sometimes does not show
        // Suspected to be Discord caching service failing when url is similar to existing
        // For now, simply means 1s delay on any of these - shame
        await new Promise((resolve) => setTimeout(resolve, 1000));
        message = await message.edit(draftMessage as MessageEditOptions);

        merge(card, { _metadata: { discord: { messageUrl: message.url, lastSynced: new Date() } } });

        // Then, override previous message with message
        const oldMessage = await channel.messages.fetch(messageId);
        if (isComponentsV2(oldMessage)) {
            const overriddenMessage = messages.overriddenDraft(card);
            await oldMessage.edit(overriddenMessage as MessageEditOptions);
        } else {
            logger.warn(
                `[Discord] Cannot mark previous draft message for ${card.name} (${card.version}) as overridden - it predates Components V2 and can't be converted`
            );
        }

        return card;
    } catch (err) {
        throw new Error(`Error updating draft message for ${card.name} (${card.version})`, { cause: err });
    }
}

/** Regenerates and re-sends the given draft card's own current message, in place - no new message, no strike-through */
async function refreshDraft(card: IPlaytestCard, context: CardForumContext) {
    try {
        if (!card._metadata?.discord?.messageUrl) {
            throw new Error("Cannot refresh message of draft card as message url is missing");
        }
        card = await syncImage(card);

        const { threadCard: previous } = await getThreadFor(card);
        const draftMessage = await messages.newDraft(card, previous._metadata.discord.messageUrl, context);

        const { channelId, messageId } = extractFromURL(card._metadata.discord.messageUrl);
        const channel = await context.guild.channels.fetch(channelId);
        if (!channel?.isThread()) {
            throw new Error(`Found channel is not a thread with id: ${channelId}`);
        }
        const message = await channel.messages.fetch(messageId);
        if (!isComponentsV2(message)) {
            logger.warn(
                `[Discord] Cannot refresh draft ${card.name} (${card.version}) in place - its message predates Components V2 and can't be converted; force a sync to have it replaced`
            );
            return card;
        }
        await message.edit(draftMessage as MessageEditOptions);

        merge(card, { _metadata: { discord: { lastSynced: new Date() } } });
        return card;
    } catch (err) {
        throw new Error(`Error refreshing draft message for ${card.name} (${card.version})`, { cause: err });
    }
}

export async function onCardForumMessageDeleted(messageUrl: string) {
    logger.info(`[Discord] Forum thread message deleted: ${messageUrl}`);

    await forgetSlotPreview(messageUrl);
    let cards = await dataService.cards.read([
        { _metadata: { discord: { messageUrl } } },
        { _metadata: { discord: { previewUrl: messageUrl } } }
    ]);
    if (cards.length === 0) return;

    for (const card of cards) {
        const emitter = createSyncEmitter("card", "discord", card);
        emitter.start();
        if (card._metadata) {
            delete card._metadata.discord;
        }
        emitter.complete(card);
    }
    cards = await dataService.cards.update(cards, false, false);

    logger.info(`[Discord] Removed discord metadata for ${cards.length} card(s)`);
}

// A preview thread deleted in Discord is no longer one - its slot is left unrevealed
async function forgetSlotPreview(messageUrl: string) {
    const slots = await dataService.slots.read({
        "_metadata.preview._metadata.discord.messageUrl": messageUrl
    } as never);
    if (slots.length > 0) {
        await dataService.slots.update(
            slots.map((slot) => ({ ...slot, _metadata: omit(slot._metadata, "preview") })),
            true,
            false
        );
    }
}

/**
 * Drops the discord metadata of the provided cards, releasing their claim on an existing thread or message.
 */
export function clearDiscordMetadata(cards: IPlaytestCard[]) {
    for (const card of cards) {
        if (card._metadata?.discord) {
            delete card._metadata.discord;
        }
    }
}

async function threadAt(messageUrl: string, guild: Guild) {
    const { channelId } = extractFromURL(messageUrl);
    const channel = await guild.channels.fetch(channelId);
    if (!channel?.isThread()) {
        throw new Error(`Found channel is not a thread with id: ${channelId}`);
    }
    return channel;
}

function previewNotice(card: Pick<IPlaytestCard, "faction">, content: string) {
    const container = new ContainerBuilder()
        .setAccentColor(resolveColor(colors[card.faction]))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 as const,
        allowedMentions: { parse: [] as never[] }
    };
}

// Says why a preview is over in its thread, then locks and archives it - the discussion stays
async function closePreview(preview: IPlaytestCard, context: CardForumContext, content: string) {
    const thread = await threadAt(previewUrlOf(preview), context.guild);
    if (thread.archived) {
        await thread.setArchived(false);
    }
    await thread.send(previewNotice(preview, content));
    await lockAndArchive(thread, preview, context);
}

const previewOf = (card: IPlaytestCard, messageUrl: string): IPlaytestCard => ({
    ...omit(card, "_metadata"),
    _metadata: { discord: { messageUrl, lastSynced: new Date() } }
});

// Only making a draft project's tag is shared work, so only that is done one at a time - the previews go side by side
async function getRevealContext(project: number) {
    const release = await syncCardForumMutex.acquire();
    try {
        return await getCardForumContext(project);
    } finally {
        release();
    }
}

/** Posts a draft project's card as a preview thread, closing the preview it replaces with a link to the new */
export async function revealDraftCard(card: IPlaytestCard, replacing?: IPlaytestCard) {
    const context = await getRevealContext(card.project);
    const revealed = (await reopenPreview(card, context)) ?? (await createPreview(card, context));
    const { messageUrl } = revealed._metadata.discord;
    if (replacing) {
        await closePreview(
            replacing,
            context,
            `### Preview replaced\nThe preview of this slot is now [${revealed.name}](${messageUrl}).`
        );
    }
    return previewOf(revealed, messageUrl);
}

/** Brings a preview up to date in place - its post, and its thread's name and tags - from the card as it is now */
export async function updateReveal(card: IPlaytestCard, preview: IPlaytestCard) {
    const context = await getRevealContext(card.project);
    const refreshed = await refreshPreview(
        { ...card, _metadata: { ...card._metadata, discord: { messageUrl: previewUrlOf(preview) } } },
        context
    );
    return previewOf(refreshed, previewUrlOf(preview));
}

async function refreshPreview(card: IPlaytestCard, context: CardForumContext) {
    card = await refreshCardMessage(card, context);
    const thread = await threadAt(card._metadata.discord.messageUrl, context.guild);
    const name = threadNameFor(card);
    try {
        if (thread.name !== name) {
            await thread.setName(name);
        }
        await thread.setAppliedTags(tagsFor(card, context).map((tag) => tag.id));
    } catch (err) {
        if (!(err instanceof RateLimitError)) {
            throw err;
        }
        logger.warn(
            `[Discord] Can't rename the preview of ${card.name} yet - it will be tried again on the next update`
        );
    }
    return card;
}

// A card revealed before keeps the thread it was closed with, so revealing it again opens that rather than a new one
async function reopenPreview(card: IPlaytestCard, context: CardForumContext) {
    const previewUrl = card._metadata?.discord?.previewUrl;
    if (!previewUrl) {
        return undefined;
    }
    try {
        const thread = await threadAt(previewUrl, context.guild);
        if (thread.archived) {
            await thread.setArchived(false);
        }
        if (thread.locked) {
            await thread.setLocked(false);
        }
        const reopened = await refreshPreview(
            { ...card, _metadata: { ...card._metadata, discord: { messageUrl: previewUrl } } },
            context
        );
        await thread.send(previewNotice(card, "### Preview reopened\nThis card is being previewed again."));
        return reopened;
    } catch (err) {
        if (err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.UnknownChannel) {
            return undefined;
        }
        throw err;
    }
}

/** The card as it is once its preview thread is closed - no longer previewed, but still pointing to the thread */
export function withClosedThread(card: IPlaytestCard, messageUrl: string): IPlaytestCard {
    return { ...card, _metadata: { ...omit(card._metadata, "discord"), discord: { previewUrl: messageUrl } } };
}

/** The card without the link to a closed thread, as it is once that thread is open again as its preview */
export function withoutClosedThread(card: IPlaytestCard): IPlaytestCard {
    return { ...card, _metadata: omit(card._metadata, "discord") };
}

// What a preview thread is told as it is closed, by why
export const PREVIEW_NOTICES = {
    withdrawn: "### Preview withdrawn\nThis card is no longer being previewed.",
    slotRemoved: "### Slot removed\nThis slot is no longer part of the project.",
    projectDeleted: "### Project deleted\nThe project this card was drafted for has been deleted."
};

/** Closes a preview thread, saying it is withdrawn - its card, if there is one, is left as it is */
export async function withdrawReveal(preview: IPlaytestCard, notice = PREVIEW_NOTICES.withdrawn) {
    await closePreview(preview, await getRevealContext(preview.project), notice);
}

export async function deleteDraft(card: IPlaytestCard) {
    try {
        if (!card.draft) {
            throw new Error("Card is not in draft");
        }
        if (!card._metadata?.discord?.messageUrl) {
            // Nothing to delete if the draft was never synced to discord
            return card;
        }
        // Delete the draft priumary message
        const { channelId, messageId } = extractFromURL(card._metadata.discord.messageUrl);
        const guild = await discordService.getGuild();
        const channel = await guild.channels.fetch(channelId);
        if (!channel.isThread()) {
            throw new Error(`Found channel is not a thread with id: ${channelId}`);
        }
        const draftMessage = await channel.messages.fetch(messageId);
        await draftMessage.delete();

        const { thread } = await getThreadFor(card);
        const starter = await thread.fetchStarterMessage();
        const deleteMessage = messages.deleteDraft(card, starter.url);
        await thread.send(deleteMessage);

        if (card._metadata) {
            delete card._metadata.discord;
        }

        return card;
    } catch (err) {
        throw new Error(`Error deleting draft message for ${card.name} (${card.version})`, { cause: err });
    }
}

interface CardForumContext {
    guild: Guild;
    channel: ForumChannel;
    taggedRole: Role;
    projectTags: Record<number, GuildForumTag>;
    factionTags: Record<string, GuildForumTag>;
    latestTag: GuildForumTag;
}

// Used to fetch all Discord forum data once, and re-use details.
// Ensures that forum is valid before any alterations begin
async function getCardForumContext(revealing?: number): Promise<CardForumContext> {
    const forumName = "card-forum";
    const guild = await discordService.getGuild();
    const errors: string[] = [];
    // Check forum channel exists
    const channel = guild.channels.cache.find(
        (c) => c instanceof ForumChannel && c.name.endsWith(forumName)
    ) as ForumChannel;
    if (!channel) {
        errors.push(`"${forumName}" channel does not exist or is not a forum`);
    }

    // Check DT role exists
    const taggedRole = await discordService.findRoleByName(guild, "Design Team");
    if (!taggedRole) {
        errors.push('"Design Team" role does not exist');
    }

    const projects = await dataService.projects.read([
        { active: true },
        ...(revealing === undefined ? [] : [{ number: revealing }])
    ]);
    const projectTags: Record<number, GuildForumTag> = {};
    for (const project of projects) {
        // Check project tag exists - a draft project being revealed has none until it is first revealed
        let projectTag = channel?.availableTags.find((t) => t.name === project.code);
        if (!projectTag && channel && project.number === revealing) {
            projectTag = await addProjectTag(channel, project);
        }
        if (!projectTag) {
            errors.push(`"${project.code}" tag is missing on forum "${forumName}"`);
        } else {
            projectTags[project.number] = projectTag;
        }
    }

    const factionTags: Record<string, GuildForumTag> = {};
    for (const [faction, name] of Object.entries(factionNames)) {
        const factionTag = channel?.availableTags.find((t) => t.name === name);
        if (!factionTag) {
            errors.push(`"${name}" tag is missing on Forum channel "${forumName}"`);
        } else {
            factionTags[faction] = factionTag;
        }
    }

    // Check "latest" tag exists
    const latestTag = channel?.availableTags.find((t) => t.name === "Latest");
    if (!latestTag) {
        errors.push(`"Latest" tag is missing on forum "${forumName}"`);
    }

    if (errors.length > 0) {
        throw Error(`Failed to build context: ${errors.join(", ")}`);
    }

    return { guild, channel, taggedRole, projectTags, factionTags, latestTag };
}

async function addProjectTag(channel: ForumChannel, project: IProject) {
    const emoji = project.emoji && unicodeEmojis[project.emoji];
    await channel.setAvailableTags([
        ...channel.availableTags,
        { name: project.code, ...(emoji && { emoji: { id: null, name: emoji } }) }
    ]);
    logger.info(`[Discord] Added the "${project.code}" tag to the card forum`);
    return channel.availableTags.find((tag) => tag.name === project.code);
}

function createMessageButtons(card: IPlaytestCard, previousUrl?: string) {
    const buttons: ButtonBuilder[] = [];

    if (previousUrl) {
        const previous = new ButtonBuilder()
            .setLabel("Previous Version")
            .setURL(previousUrl)
            .setStyle(ButtonStyle.Link);
        buttons.push(previous);
    }
    const cardPage = new ButtonBuilder()
        .setLabel("View Card Page")
        .setURL(`${process.env.CLIENT_HOST}/project/${card.project}/${card.number}`)
        .setStyle(ButtonStyle.Link);
    buttons.push(cardPage);
    return buttons;
}

/** The bare accent-coloured heading container every card-forum message shares */
function headingContainer(card: IPlaytestCard, heading: string): ContainerBuilder {
    return new ContainerBuilder()
        .setAccentColor(resolveColor(colors[card.faction]))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(heading));
}

/** The accent-coloured card container every card-forum message is built around - heading, optional note, image */
async function createCardContainer(card: IPlaytestCard, heading: string): Promise<ContainerBuilder> {
    const imageUrl = await getTimeLockedImageUrl(card);
    const container = headingContainer(card, heading);

    if (card.note) {
        const emojis = await discordService.getEmojiMap();
        // Measured as what Discord will receive, markers and emoji included, rather than as readable text
        const asDiscord = (html: string) => toDiscord(html, { emojis });
        const noteText =
            `**${labelEmojis[card.note.type]} ${capitalize(card.note.type)}**\n` +
            asDiscord(truncateHtml(card.note.text, TEXT_DISPLAY_MAX, (html) => asDiscord(html).length));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(noteText));
    }

    return container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl))
    );
}

// The small print of a card made from a suggestion - which one, and a link to it
async function suggestionFooter(card: IPlaytestCard) {
    if (!card.suggestionId) {
        return undefined;
    }
    const [suggestion] = await dataService.suggestions.read({ id: card.suggestionId });
    if (!suggestion) {
        return undefined;
    }
    const name = suggestion.card.name.replace(/[[\]]/g, "");
    const author = suggestion.createdBy ? ` by <@${suggestion.createdBy}>` : "";
    return `-# From the suggestion [${name}](${process.env.CLIENT_HOST}/suggestions/${suggestion.id})${author}`;
}

// Thread helper functions
function threadNameFor(card: IPlaytestCard) {
    const cardLabel = `${card.name} (${isPreview(card) ? "Preview" : card.version})`;
    return `${card.number}. ${cardLabel}`;
}
export async function getThreadFor(card: IPlaytestCard) {
    let target = card;
    if (card.draft) {
        let previous = await dataService.cards.previous(card);
        if (!previous) {
            throw new Error(`Failed to find previous version for draft card "${card.code}"`);
        }

        if (!previous._metadata?.discord?.messageUrl) {
            logger.info(
                `[Discord] previous card for draft card "${card.code}" is missing thread. Attempting to create...`
            );
            const emitter = createSyncEmitter("card", "discord", previous);
            emitter.start();
            previous = await syncCardThread(previous, undefined, emitter);
        }

        target = previous;
    }

    if (!target._metadata?.discord?.messageUrl) {
        throw new Error(`Missing discord message url data for "${card.code}"`);
    }

    const { messageId: threadId } = extractFromURL(target._metadata.discord.messageUrl);
    const guild = await discordService.getGuild();
    const thread = await guild.channels.fetch(threadId);
    if (!thread) {
        throw new Error(`Failed to find thread with id: ${threadId}`);
    }
    if (!thread.isThread()) {
        throw new Error(`Found channel is not a thread with id: ${threadId}`);
    }
    return { thread, threadCard: target };
}
async function createThreadFor(
    card: IPlaytestCard,
    message: GuildForumThreadMessageCreateOptions,
    context: CardForumContext
) {
    logger.info(`[Discord] Creating thread for ${card.name} (${card.version})`);
    const name = threadNameFor(card);
    const reason = `Design Team discussion for ${card.code} - ${name}`;
    const tags = tagsFor(card, context);
    const autoArchiveDuration = context.channel.defaultAutoArchiveDuration;

    return await orderedStep(() =>
        context.channel.threads.create({
            name,
            reason,
            message,
            appliedTags: tags.map((tag) => tag.id),
            autoArchiveDuration
        })
    );
}
async function closeThreadFor(card: IPlaytestCard, context: CardForumContext) {
    try {
        const { thread } = await getThreadFor(card);
        logger.info(
            `[Discord] Closing thread for ${card.name} (${card.version}): ${card._metadata.discord.messageUrl}`
        );
        return await lockAndArchive(thread, card, context);
    } catch (err) {
        logger.warn(new Error(`[Discord] Failed to close thread for ${card.name} (${card.version})`, { cause: err }));
    }
}

type ThreadedCard = Pick<IPlaytestCard, "project" | "faction" | "latest" | "version">;

async function lockAndArchive(thread: ThreadChannel, card: ThreadedCard, context: CardForumContext) {
    if (thread.archived) {
        await thread.setArchived(false);
    }
    if (!thread.locked) {
        await thread.setLocked(true);
    }
    await thread.setAppliedTags(tagsFor(card, context).map((tag) => tag.id));
    await thread.setArchived(true);
    return thread;
}

function tagsFor(card: ThreadedCard, context: CardForumContext) {
    const tags = [context.projectTags[card.project], context.factionTags[card.faction]];
    if (card.latest && !isPreview(card)) {
        tags.unshift(context.latestTag);
    }
    return tags;
}

const messages = {
    async preview(
        card: IPlaytestCard,
        project: IProject,
        context: CardForumContext
    ): Promise<GuildForumThreadMessageCreateOptions> {
        const heading =
            `## ${project.emoji ? `:${project.emoji}: ` : ""}${project.name} #${card.number} - ${card.name}` +
            `\n<@&${context.taggedRole.id}> Early preview of **${project.code} #${card.number}** - quick feedback is welcome before the public reveal.` +
            "\n\n:warning: *Subject to major change or replacement before the initial release. Feedback on direction matters more than balance.*";

        const container = await createCardContainer(card, heading);
        const footer = await suggestionFooter(card);
        if (footer) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footer));
        }
        return {
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: ["roles"] },
            components: [container]
        };
    },
    async initial(
        card: IPlaytestCard,
        project: IProject,
        context: CardForumContext
    ): Promise<GuildForumThreadMessageCreateOptions> {
        const heading =
            "## Initial Card" +
            `\n<@&${context.taggedRole.id}> Initial version of ${project.emoji ? `:${project.emoji}: ` : ""}**${project.name}** card #${card.number} has been confirmed.`;

        const container = await createCardContainer(card, heading);
        const buttons = createMessageButtons(card);
        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
        return {
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: ["roles"] },
            components: [container, buttonRow]
        };
    },
    async newLatest(
        card: IPlaytestCard,
        project: IProject,
        playtestingUpdate: IPlaytestingUpdate,
        context: CardForumContext
    ): Promise<GuildForumThreadMessageCreateOptions> {
        const heading =
            `## Card ${capitalize(card.note?.type ?? "adjusted")}` +
            `\n<@&${context.taggedRole.id}> ${project.emoji ? `:${project.emoji}: ` : ""}**${project.name}** card #${card.number} has been adjusted & pushed to playtesting.`;

        const container = await createCardContainer(card, heading);
        const buttons = createMessageButtons(card);
        const playtestingButton = new ButtonBuilder()
            .setLabel("View Playtesting Update")
            .setURL(`${process.env.CLIENT_HOST}/project/${project.number}/updates/${playtestingUpdate.version}`)
            .setStyle(ButtonStyle.Link);
        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons, playtestingButton);

        return {
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: ["roles"] },
            components: [container, buttonRow]
        };
    },
    async released(card: IPlaytestCard, project: IProject): Promise<GuildForumThreadMessageCreateOptions> {
        const heading =
            "## Card Released" +
            `\n${project.emoji ? `:${project.emoji}: ` : ""}**${project.name}** card #${card.number} has officially been released (${card.released.code} #${card.released.number}).`;

        const container = await createCardContainer(card, heading);
        const buttons = createMessageButtons(card);
        const releaseButton = new ButtonBuilder()
            .setLabel("View Release")
            .setURL(`${process.env.CLIENT_HOST}/project/${project.number}?tab=releases`)
            .setStyle(ButtonStyle.Link);
        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons, releaseButton);

        return {
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: ["roles"] },
            components: [container, buttonRow]
        };
    },
    async newDraft(
        card: IPlaytestCard,
        previousUrl: string,
        context: CardForumContext
    ): Promise<GuildForumThreadMessageCreateOptions> {
        const isRefinement = card.note?.type === "refinement";
        const heading = isRefinement
            ? "### Refinement Added\nA refinement has been made for this card's release."
            : "## Draft Card Pending" +
              `\n<@&${context.taggedRole.id}> New draft version of this card has been proposed, and will be confirmed in the next playtesting update.`;

        const container = await createCardContainer(card, heading);
        const buttons = createMessageButtons(card, previousUrl);
        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
        return {
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: isRefinement ? [] : ["roles"] },
            components: [container, buttonRow]
        };
    },
    overriddenDraft(card: IPlaytestCard): GuildForumThreadMessageCreateOptions {
        const heading =
            "## ~~Draft Card Pending~~" + "\nDraft has been overridden by a new version, and can no longer be viewed.";
        const container = headingContainer(card, heading);

        const newVersionButton = new ButtonBuilder()
            .setLabel("View New Version")
            .setURL(card._metadata.discord.messageUrl)
            .setStyle(ButtonStyle.Link);
        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents([newVersionButton]);
        return {
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: ["roles"] },
            components: [container, buttonRow]
        };
    },
    deleteDraft(card: IPlaytestCard, previousUrl: string): GuildForumThreadMessageCreateOptions {
        const heading =
            "### Draft Card Deleted" +
            "\nA previously planned update to this card has been removed, and cannot be viewed.";
        const container = headingContainer(card, heading);

        const button = new ButtonBuilder()
            .setLabel("View Current Version")
            .setURL(previousUrl)
            .setStyle(ButtonStyle.Link);
        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
        return {
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: ["roles"] },
            components: [container, buttonRow]
        };
    }
};
