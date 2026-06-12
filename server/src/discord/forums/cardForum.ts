import { ActionRowBuilder, BaseMessageOptions, ButtonBuilder, ButtonStyle, EmbedBuilder, ForumChannel, Guild, GuildForumTag, Role } from "discord.js";
import { emojis, colors, discordify } from "../utils";
import { dataService, discordService, logger } from "@/services";
import { IPlaytestCard } from "common/models/cards";
import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { factionNames, isInitial, isPreview } from "common/utils";
import { syncImage } from "@/rendering/hosting";
import { capitalize } from "lodash-es";
import { getTimeLockedImageUrl } from "@/utils";
import { User } from "common/models/auth";
import { createSyncEmitter } from "@/services/sseService";

/**
 * Creates any new threads & messages for cards which are missing their discordMessageUrl.
 * Note: Will not update the content of these messages - only create if missing
 * @param cards Cards to sync
 */
export async function syncCardForum(cards: IPlaytestCard[]) {
    const context = await getCardForumContext();

    const toUpdate: IPlaytestCard[] = [];
    let needsUpdate = false;
    for (let card of cards) {
        const emitter = createSyncEmitter("card", "discord", card);
        try {
            emitter.start();
            if (isMessageOutdated(card)) {
                needsUpdate = true;
                // Drafts & Regular releases are treated differently:
                // - Draft will send a new message to the existing thread, and can be incrementally updated (sends as new message)
                // - Regular will send a new thread, and shouldn't ever be updated (that's what drafts are for!)
                if (card.draft) {
                    emitter.progress("Syncing Draft");
                    logger.info(`[Discord] Syncing draft ${card.name} (${card.version})`);
                    const draftMessageExists = !!card.discord?.messageUrl;
                    if (draftMessageExists) {
                        card = await updateDraft(card, context);
                    } else {
                        card = await newDraft(card, context);
                    }
                    logger.verbose(`[Discord] Synced ${card.name} (${card.version}): ${card.discord?.messageUrl}`);
                } else {
                    emitter.progress("Syncing");
                    logger.info(`[Discord] Syncing ${card.name} (${card.version})`);
                    const messageExists = !!card.discord?.messageUrl;
                    if (messageExists) {
                        // TODO: Implement updating existing message (low priority, as it really shouldn't be changing)
                        logger.warn(`[Discord] Cannot sync ${card.name} (${card.version}) as you cannot update a finalised card (for now)`);
                    } else {
                        emitter.progress("Searching");
                        const existingThread = await discordService.findForumThread(context.channel, (thread) => thread.name === threadNameFor(card));
                        if (existingThread) {
                            // For legacy reasons; if a thread exists before card.discord was created, we need to map it
                            const starter = await existingThread.fetchStarterMessage();
                            card.discord = {
                                messageUrl: starter.url,
                                lastSynced: new Date()
                            };
                        } else {
                            emitter.progress("Syncing");
                            if (isPreview(card)) {
                                card = await createPreview(card, context);
                            } else if (isInitial(card)) {
                                card = await createInitial(card, context);
                            } else {
                                card = await createNewLatest(card, context);
                            }
                        }
                        logger.verbose(`[Discord] Synced ${card.name} (${card.version}): ${card.discord?.messageUrl}`);
                    }
                }
            }
            toUpdate.push(card);
            emitter.complete(card);
        } catch (err) {
            emitter.error("Failure");
            logger.warn(new Error(`[Discord] Failed to sync ${card.name} (${card.version})`, { cause: err }));
        }
    }
    if (needsUpdate) {
        cards = await dataService.cards.update(toUpdate, false, false);
    }
    return cards;
}

function isMessageOutdated(card: IPlaytestCard) {
    return !card.discord?.lastSynced || card.updated > card.discord.lastSynced;
}

export async function createPreview(card: IPlaytestCard, context?: CardForumContext) {
    try {
        context = context ?? await getCardForumContext();
        if (!card.draft) {
            throw new Error("Card is not draft");
        }
        card = await syncImage(card);

        const [project] = await dataService.projects.read({ number: card.project });
        const [user] = await dataService.users.read({ discordId: card.updatedBy });
        const previewMessage = messages.preview(card, project, user, context);
        const thread = await createThreadFor(card, previewMessage, context);

        // Pin the first message of the newly-created thread
        const starter = await thread.fetchStarterMessage();
        await starter.pin();

        card.discord = {
            messageUrl: starter.url,
            lastSynced: new Date()
        };
        return card;
    } catch (err) {
        throw new Error(`Error creating preview thread for ${card.name} (Preview)`, { cause: err });
    }
}

export async function createInitial(card: IPlaytestCard, context?: CardForumContext) {
    try {
        context = context ?? await getCardForumContext();
        if (!card.latest) {
            throw new Error("Card is not latest");
        }
        card = await syncImage(card);

        const [project] = await dataService.projects.read({ number: card.project });
        const [user] = await dataService.users.read({ discordId: card.updatedBy });
        const initialMessage = messages.initial(card, project, user, context);
        const thread = await createThreadFor(card, initialMessage, context);

        // Pin the first message of the newly-created thread
        const starter = await thread.fetchStarterMessage();
        await starter.pin();

        const preview = await dataService.cards.previous(card);
        if (preview) {
            // Close preview thread, if it exists
            await closeThreadFor(preview, context);
        }

        card.discord = {
            messageUrl: starter.url,
            lastSynced: new Date()
        };
        return card;
    } catch (err) {
        throw new Error(`Error creating initial thread for ${card.name} (${card.version})`, { cause: err });
    }
}

export async function createNewLatest(card: IPlaytestCard, context?: CardForumContext) {
    try {
        context = context ?? await getCardForumContext();
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
        const [user] = await dataService.users.read({ discordId: card.updatedBy });
        const latestMessage = messages.newLatest(card, project, playtestingUpdate, user, context);
        const thread = await createThreadFor(card, latestMessage, context);

        // Pin the first message of the newly-created thread
        const starter = await thread.fetchStarterMessage();
        await starter.pin();

        const previous = await dataService.cards.previous(card);
        if (previous) {
            // Close previous thread, if it exists
            await closeThreadFor(previous, context);
        }

        card.discord = {
            messageUrl: starter.url,
            lastSynced: new Date()
        };
        return card;
    } catch (err) {
        throw new Error(`Error creating new latest thread for ${card.name} (${card.version})`, { cause: err });
    }
}

export async function newDraft(card: IPlaytestCard, context?: CardForumContext) {
    try {
        context = context ?? await getCardForumContext();
        if (!card.draft) {
            throw new Error("Card is not in draft");
        }
        card = await syncImage(card);

        const { thread, threadCard: previous } = await getThreadFor(card);
        const [user] = await dataService.users.read({ discordId: card.updatedBy });
        const draftMessage = messages.newDraft(card, user, previous.discord.messageUrl, context);
        let message = await thread.send(draftMessage);
        // Bug: Found an issue where embed image sometimes does not show
        // Suspected to be Discord caching service failing when url is similar to existing
        // For now, simply means 1s delay on any of these - shame
        await new Promise(resolve => setTimeout(resolve, 1000));
        message = await message.edit(draftMessage);

        card.discord = {
            messageUrl: message.url,
            lastSynced: new Date()
        };
        return card;
    } catch (err) {
        throw new Error(`Error creating new draft message for ${card.name} (${card.version})`, { cause: err });
    }
}

export async function updateDraft(card: IPlaytestCard, context?: CardForumContext) {
    try {
        context = context ?? await getCardForumContext();
        if (!card.draft) {
            throw new Error("Card is not in draft");
        }
        if (!card.discord?.messageUrl) {
            throw new Error("Cannot edit message of draft card as message url is missing");
        }

        const { channelId, messageId } = extractFromURL(card.discord?.messageUrl);
        const channel = await context.guild.channels.fetch(channelId);
        if (!channel.isThread()) {
            throw new Error(`Found channel is not a thread with id: ${channelId}`);
        }
        card = await syncImage(card);

        // Send update message to thread
        const { thread, threadCard: previous } = await getThreadFor(card);
        const [user] = await dataService.users.read({ discordId: card.updatedBy });
        const draftMessage = messages.newDraft(card, user, previous.discord.messageUrl, context);
        let message = await thread.send(draftMessage);
        // Bug: Found an issue where embed image sometimes does not show
        // Suspected to be Discord caching service failing when url is similar to existing
        // For now, simply means 1s delay on any of these - shame
        await new Promise(resolve => setTimeout(resolve, 1000));
        message = await message.edit(draftMessage);

        card.discord = {
            messageUrl: message.url,
            lastSynced: new Date()
        };

        // Then, override previous message with message
        const oldMessage = await channel.messages.fetch(messageId);
        const overriddenMessage = messages.overriddenDraft(card);
        await oldMessage.edit(overriddenMessage);

        return card;
    } catch (err) {
        throw new Error(`Error updating draft message for ${card.name} (${card.version})`, { cause: err });
    }
}

export async function deleteDraft(card: IPlaytestCard) {
    try {
        if (!card.draft) {
            throw new Error("Card is not in draft");
        }
        if (!card.discord?.messageUrl) {
            throw new Error("Original message does not exist to delete");
        }
        // Delete the draft priumary message
        const { channelId, messageId } = extractFromURL(card.discord?.messageUrl);
        const guild = await discordService.getGuild();
        const channel = await guild.channels.fetch(channelId);
        if (!channel.isThread()) {
            throw new Error(`Found channel is not a thread with id: ${channelId}`);
        }
        const draftMessage = await channel.messages.fetch(messageId);
        await draftMessage.delete();

        const { thread } = await getThreadFor(card);
        const starter = await thread.fetchStarterMessage();
        const deleteMessage = messages.deleteDraft(starter.url);
        await thread.send(deleteMessage);

        delete card.discord;

        return card;
    } catch (err) {
        throw new Error(`Error deleting draft message for ${card.name} (${card.version})`, { cause: err });
    }
}

interface CardForumContext {
    guild: Guild,
    channel: ForumChannel;
    taggedRole: Role;
    projectTags: Record<number, GuildForumTag>;
    factionTags: Record<string, GuildForumTag>;
    latestTag: GuildForumTag;
}

// Used to fetch all Discord forum data once, and re-use details.
// Ensures that forum is valid before any alterations begin
async function getCardForumContext(): Promise<CardForumContext> {
    const forumName = "card-forum";
    const guild = await discordService.getGuild();
    const errors: string[] = [];
    // Check forum channel exists
    const channel = guild.channels.cache.find((c) => c instanceof ForumChannel && c.name.endsWith(forumName)) as ForumChannel;
    if (!channel) {
        errors.push(`"${forumName}" channel does not exist or is not a forum`);
    }

    // Check DT role exists
    const taggedRole = await discordService.findRoleByName(guild, "Design Team");
    if (!taggedRole) {
        errors.push("\"Design Team\" role does not exist");
    }

    const projects = await dataService.projects.read({ active: true });
    const projectTags: Record<number, GuildForumTag> = {};
    for (const project of projects) {
        // Check project tag exists
        const projectTag = channel?.availableTags.find((t) => t.name === project.code);
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
function createCardEmbeds(card: IPlaytestCard, user: User | undefined) {
    // Add a time component to force discord to see it as a new url/image (as it caches based on url)
    const imageUrl = getTimeLockedImageUrl(card);
    let imageEmbed = new EmbedBuilder()
        .setColor(colors[card.faction])
        .setImage(imageUrl)
        .setTimestamp(card.updated);
    if (user) {
        imageEmbed = imageEmbed.setFooter({
            text: user.displayname,
            iconURL: user.avatarUrl
        });
    }
    if (card.note) {
        imageEmbed = imageEmbed
            .setTitle(`${emojis[card.note.type]} ${capitalize(card.note.type)}`)
            .setDescription(discordify(card.note.text));
    }
    return [imageEmbed];
}

function extractFromURL(url: string) {
    const [, guildId, channelId, messageId] = url.match(/(\d+)\/(\d+)\/(\d+)$/) || [];
    return { guildId, channelId, messageId };
}

// Thread helper functions
function threadNameFor(card: IPlaytestCard) {
    const cardLabel = `${card.name} ${isPreview(card) ? "Preview" : card.version}`;
    return `${card.number}. ${cardLabel}`;
}
async function getThreadFor(card: IPlaytestCard) {
    let target = card;
    if (card.draft) {
        let previous = await dataService.cards.previous(card);
        if (!previous) {
            throw new Error(`Failed to find previous version for draft card "${card.code}"`);
        }

        if (!previous.discord?.messageUrl) {
            logger.info(`[Discord] previous card for draft card "${card.code}" is missing thread. Attempting to create...`);
            [previous] = await syncCardForum([previous]);
        }

        target = previous;
    }

    if (!target.discord?.messageUrl) {
        throw new Error(`Missing discord message url data for "${card.code}"`);
    }

    const { messageId: threadId } = extractFromURL(target.discord.messageUrl);
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
async function createThreadFor(card: IPlaytestCard, message: BaseMessageOptions, context: CardForumContext) {
    logger.info(`[Discord] Creating thread for ${card.name} (${card.version})`);
    const name = threadNameFor(card);
    const reason = `Design Team discussion for ${card.code} - ${name}`;
    const tags = [
        context.projectTags[card.project],
        context.factionTags[card.faction]
    ];
    if (card.latest && !isPreview(card)) {
        tags.unshift(context.latestTag);
    }
    const autoArchiveDuration = context.channel.defaultAutoArchiveDuration;

    const thread = await context.channel.threads.create({
        name,
        reason,
        message,
        appliedTags: tags.map((tag) => tag.id),
        autoArchiveDuration
    });

    return thread;
}
async function closeThreadFor(card: IPlaytestCard, context: CardForumContext) {
    try {
        const { thread } = await getThreadFor(card);
        logger.info(`[Discord] Closing thread for ${card.name} (${card.version}): ${card.discord.messageUrl}`);
        if (thread.archived) {
            await thread.setArchived(false);
        }
        if (!thread.locked) {
            await thread.setLocked(true);
        }
        const tags = [
            context.projectTags[card.project],
            context.factionTags[card.faction]
        ];
        if (card.latest && !isPreview(card)) {
            tags.unshift(context.latestTag);
        }
        await thread.setAppliedTags(tags.map((tag) => tag.id));
        await thread.setArchived(true);
        return thread;
    } catch (err) {
        logger.warn(new Error(`[Discord] Failed to close thread for ${card.name} (${card.version})`, { cause: err }));
    }
}

const messages = {
    preview(card: IPlaytestCard, project: IProject, user: User | undefined, context: CardForumContext): BaseMessageOptions {
        const content = "## Card Reveal"
            + `\n<@&${context.taggedRole.id}> See the early preview of ${project.emoji ? `:${project.emoji}: ` : ""}**${project.name}** card #${card.number} below. Feel free to give your quick feedback for us to consider prior to public reveal.`
            + "\n\n*Please keep in mind that this card preview is subject to major change or replacement prior to the initial playtesting release, and should be treated more as an indication of direction rather than balance - opinions on balance are fine, but are not a focus at this point.*";

        const embeds = createCardEmbeds(card, user);

        return {
            content,
            allowedMentions: { parse: ["roles"] },
            embeds
        };
    },
    initial(card: IPlaytestCard, project: IProject, user: User | undefined, context: CardForumContext): BaseMessageOptions {
        const content = "## Initial Card"
            + `\n<@&${context.taggedRole.id}> Initial version of ${project.emoji ? `:${project.emoji}: ` : ""}**${project.name}** card #${card.number} has been confirmed.`;

        const embeds = createCardEmbeds(card, user);

        const buttons = createMessageButtons(card);
        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
        return {
            content,
            allowedMentions: { parse: ["roles"] },
            embeds,
            components: [buttonRow]
        };
    },
    newLatest(card: IPlaytestCard, project: IProject, playtestingUpdate: IPlaytestingUpdate, user: User | undefined, context: CardForumContext): BaseMessageOptions {
        const content = `## Card ${capitalize(card.note?.type ?? "adjusted")}`
        + `\n<@&${context.taggedRole.id}> ${project.emoji ? `:${project.emoji}: ` : ""}**${project.name}** card #${card.number} has been adjusted & pushed to playtesting.`;

        const embeds = createCardEmbeds(card, user);

        const buttons = createMessageButtons(card);
        const playtestingButton = new ButtonBuilder()
            .setLabel("View Playtesting Update")
            .setURL(`${process.env.CLIENT_HOST}/project/${project.number}/updates/${playtestingUpdate.version}`)
            .setStyle(ButtonStyle.Link);
        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons, playtestingButton);

        return {
            content,
            allowedMentions: { parse: ["roles"] },
            embeds,
            components: [buttonRow]
        };
    },
    newDraft(card: IPlaytestCard, user: User | undefined, previousUrl: string, context: CardForumContext): BaseMessageOptions {
        const content = "## Draft Card Pending"
        + `\n<@&${context.taggedRole.id}> New draft version of this card has been proposed, and will be confirmed in the next playtesting update.`;

        const embeds = createCardEmbeds(card, user);

        const buttons = createMessageButtons(card, previousUrl);
        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
        return {
            content,
            allowedMentions: { parse: ["roles"] },
            embeds,
            components: [buttonRow]
        };
    },
    overriddenDraft(card: IPlaytestCard): BaseMessageOptions {
        const content = "## ~~Draft Card Pending~~"
        + "\nDraft has been overridden by a new version, and can no longer be viewed.";

        const newVersionButton = new ButtonBuilder()
            .setLabel("View New Version")
            .setURL(card.discord.messageUrl)
            .setStyle(ButtonStyle.Link);
        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents([newVersionButton]);
        return {
            content,
            embeds: [],
            components: [buttonRow]
        };
    },
    deleteDraft(previousUrl: string): BaseMessageOptions {
        const content = "### Draft Card Deleted"
        + "\nA previously planned update to this card has been removed, and cannot be viewed.";

        const button = new ButtonBuilder()
            .setLabel("View Current Version")
            .setURL(previousUrl)
            .setStyle(ButtonStyle.Link);
        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
        return {
            content,
            components: [buttonRow]
        };
    }
};