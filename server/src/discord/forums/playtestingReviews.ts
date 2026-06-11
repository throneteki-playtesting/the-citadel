import { IPlaytestCard } from "common/models/cards";
import { IPlaytestReview, StatementQuestions } from "common/models/reviews";
import { Guild, ForumChannel, GuildForumTag, BaseMessageOptions, EmbedBuilder, AttachmentBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder } from "discord.js";
import { colors, emojis } from "../utils";
import { capitalize } from "lodash-es";
import { dataService, discordService, logger } from "@/services";
import { factionNames, isPreview, parseCardCode } from "common/utils";
import { createSyncEmitter } from "@/services/sseService";
import { syncImage } from "@/rendering/hosting";
import { User } from "common/models/auth";

export async function syncReviewForum(reviews: IPlaytestReview[]) {
    const context = await getPlaytestingReviewContext();

    const toUpdate: IPlaytestReview[] = [];
    let needsUpdate = false;
    for (let review of reviews) {
        const emitter = createSyncEmitter("review", "discord", review);
        try {
            if (isMessageOutdated(review)) {
                emitter.progress("Syncing");
                needsUpdate = true;
                logger.info(`[Discord] Syncing ${parseCardCode(false, review.project, review.number)} (${review.version}) review by ${review.reviewer}`);
                const [card] = await dataService.cards.read({ project: review.project, number: review.number, version: review.version });
                const user = await discordService.getUserFromId(context.guild, review.reviewer);

                let initialExists = !!review.discord?.messageUrl;
                if (!initialExists) {
                    emitter.progress("Searching");
                    const existingThread = await discordService.findForumThread(context.channel, (thread) => thread.name === threadNameFor(card, user));
                    if (existingThread) {
                        // For legacy reasons; if a thread exists before review.discord was created, we need to map it
                        const starter = await existingThread.fetchStarterMessage();
                        review.discord = {
                            messageUrl: starter.url,
                            lastSynced: new Date(starter.createdTimestamp)
                        };
                        initialExists = true;
                        logger.info(`[Discord] Found & attaching thread for ${parseCardCode(false, review.project, review.number)} (${review.version}) review by ${review.reviewer}`);
                    }
                }
                // Check outdated again, in case it was mapped from above code
                if (isMessageOutdated(review)) {
                    emitter.progress("Syncing");
                    if (initialExists) {
                        review = await updateInitial(review, card, user, context);
                    } else {
                        review = await createInitial(review, card, user, context);
                    }
                }
                logger.verbose(`[Discord] Synced ${parseCardCode(false, review.project, review.number)} (${review.version}) review by ${review.reviewer}: ${review.discord?.messageUrl}`);
            }
            emitter.complete(review);
        } catch (err) {
            emitter.error("Failure");
            logger.warn(new Error(`[Discord] Failed to sync ${parseCardCode(false, review.project, review.number)} (${review.version}) review by ${review.reviewer}`, { cause: err }));
        }
        toUpdate.push(review);
    }

    if (needsUpdate) {
        reviews = await dataService.reviews.update(toUpdate, false, false);
    }

    return reviews;
}
function isMessageOutdated(review: IPlaytestReview) {
    return !review.discord?.lastSynced || review.updated > review.discord.lastSynced;
}
interface PlaytestingReviewContext {
    guild: Guild,
    channel: ForumChannel;
    projectTags: Record<number, GuildForumTag>;
    factionTags: Record<string, GuildForumTag>;
}

export async function createInitial(review: IPlaytestReview, card: IPlaytestCard, user: User, context?: PlaytestingReviewContext) {
    try {
        context = context ?? await getPlaytestingReviewContext();

        card = await syncImage(card);

        const initialMessage = messages.initial(review, user, card);
        const thread = await createThreadFor(review, card, user, initialMessage, context);

        // Pin the first message of the newly-created thread
        const starter = await thread.fetchStarterMessage();
        await starter.pin();

        review.discord = {
            messageUrl: starter.url,
            lastSynced: new Date()
        };
        return review;
    } catch (err) {
        throw new Error(`Error creating initial thread for ${parseCardCode(false, review.project, review.number)} (${review.version}) review by ${review.reviewer}`, { cause: err });
    }
};

export async function updateInitial(review: IPlaytestReview, card: IPlaytestCard, user: User, context?: PlaytestingReviewContext) {
    try {
        context = context ?? await getPlaytestingReviewContext();

        card = await syncImage(card);

        if (!review.discord?.messageUrl) {
            throw new Error("Cannot edit message of review as message url is missing");
        }

        const { channelId, messageId } = extractFromURL(review.discord?.messageUrl);
        const channel = await context.guild.channels.fetch(channelId);
        if (!channel.isThread()) {
            throw new Error(`Found channel is not a thread with id: ${channelId}`);
        }

        // Update original message on thread
        const thread = await getThreadFor(review);
        let message = await channel.messages.fetch(messageId);
        const initialMessage = messages.initial(review, user, card);
        message = await message.edit(initialMessage);

        review.discord = {
            messageUrl: message.url,
            lastSynced: new Date()
        };

        // Then, send update message to thread, ensuring the correct user is listed as the updater
        let updatedBy = user;
        if (user.discordId !== review.updatedBy) {
            updatedBy = await discordService.getUserFromId(context.guild, review.updatedBy);
        }
        const updateMessage = messages.update(review, updatedBy);
        await thread.send(updateMessage);

        return review;
    } catch (err) {
        throw new Error(`Error updating review thread for ${parseCardCode(false, review.project, review.number)} (${review.version}) review by ${review.reviewer}`, { cause: err });
    }
}

export async function deleteInitial(review: IPlaytestReview, context?: PlaytestingReviewContext) {
    try {
        context = context ?? await getPlaytestingReviewContext();

        if (!review.discord?.messageUrl) {
            throw new Error("Cannot delete review as message url is missing");
        }

        const { channelId, messageId } = extractFromURL(review.discord?.messageUrl);
        const channel = await context.guild.channels.fetch(channelId);
        if (!channel.isThread()) {
            throw new Error(`Found channel is not a thread with id: ${channelId}`);
        }

        const message = await channel.messages.fetch(messageId);
        await message.delete();

        delete review.discord;

        return review;
    } catch (err) {
        throw new Error(`Error deleting review thread for ${parseCardCode(false, review.project, review.number)} (${review.version}) review by ${review.reviewer}`, { cause: err });
    }
}

// Thread helper functions
function threadNameFor(card: IPlaytestCard, user: User) {
    const cardLabel = `${card.name} ${isPreview(card) ? "Preview" : card.version}`;
    return `${card.number} | ${cardLabel} - ${user.displayname}`;
}
async function createThreadFor(review: IPlaytestReview, card: IPlaytestCard, user: User, message: BaseMessageOptions, context: PlaytestingReviewContext) {
    logger.info(`[Discord] Creating thread for ${card.name} (${card.version}) - ${user.displayname}`);
    const name = threadNameFor(card, user);
    const reason = `Playtesting Review by ${user.displayname} for ${card.code}, ${card.name} (${card.version})`;
    const tags = [
        context.projectTags[card.project],
        context.factionTags[card.faction]
    ];
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
async function getThreadFor(review: IPlaytestReview) {
    const { messageId: threadId } = extractFromURL(review.discord.messageUrl);
    const guild = await discordService.getGuild();
    const thread = await guild.channels.fetch(threadId);
    if (!thread) {
        throw new Error(`Failed to find thread with id: ${threadId}`);
    }
    if (!thread.isThread()) {
        throw new Error(`Found channel is not a thread with id: ${threadId}`);
    }
    return thread;
}

async function getPlaytestingReviewContext(): Promise<PlaytestingReviewContext> {
    const forumName = "playtesting-reviews";
    const guild = await discordService.getGuild();
    const errors = [];
    // Check forum channel exists
    const channel = guild.channels.cache.find((c) => c instanceof ForumChannel && c.name.endsWith(forumName)) as ForumChannel;
    if (!channel) {
        errors.push(`"${forumName}" channel does not exist or is not a forum`);
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

    if (errors.length > 0) {
        throw Error(`Failed to build context: ${errors.join(", ")}`);
    }

    return { guild, channel, projectTags, factionTags };
}

function createReviewEmbeds(review: IPlaytestReview, user: User) {
    const embed = new EmbedBuilder()
        .setAuthor({
            name: user.displayname,
            iconURL: user.avatarUrl
        })
        .addFields(
            {
                name: "✦ Decks Submitted",
                value: `${review.decks.length}`,
                inline: true
            },
            {
                name: "✦ Games Played",
                value: `${review.played}`,
                inline: true
            },
            {
                name: "✦ Statements (agree/disagree)",
                value: Object.entries(review.statements).map(([statement, answer]) =>
                    `- **${StatementQuestions[statement]}:** _${capitalize(answer)}_ ${emojis[answer]}`
                ).join("\n"),
                inline: false
            }
        );
    const embeds = [embed];
    if (review.additional) {
        const fieldSize = 1024;
        if (review.additional.length > fieldSize) {
            const descriptionSize = 4096;
            for (let i = 0; i < review.additional.length; i += descriptionSize) {
                const chunk = review.additional.slice(i, i + descriptionSize);
                const embed = new EmbedBuilder()
                    .setAuthor({ name: `✦ Additional Comments${i > 0 ? " (extended)" : ""}` })
                    .setColor(colors.review)
                    .setDescription(chunk);
                embeds.push(embed);
            }
        } else {
            embed.addFields([
                {
                    name: "✦ Additional Comments",
                    value: review.additional
                }
            ]);
        }
    }
    // Put timestamp on last embed
    embeds[embeds.length - 1].setTimestamp(review.created);

    return embeds;
}

function extractFromURL(url: string) {
    const [, guildId, channelId, messageId] = url.match(/(\d+)\/(\d+)\/(\d+)$/) || [];
    return { guildId, channelId, messageId };
}
const messages = {
    initial(review: IPlaytestReview, user: User, card: IPlaytestCard): BaseMessageOptions {
        const content = `<@${user.discordId}> has submitted a new review for **${card.name} (${card.version})**`;

        const embeds = createReviewEmbeds(review, user);

        const file = new AttachmentBuilder(card.imageUrl, { name: `${card.code}_${card.version}.png`, description: `${card.name} v${card.version}` });

        const buttons = [
            new ButtonBuilder()
                .setLabel("View Reviews & Decks")
                .setURL(`${process.env.CLIENT_HOST}/project/${card.project}/${card.number}`)
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel("Submit your own")
                .setURL(`${process.env.CLIENT_HOST}/review/submit`)
                .setStyle(ButtonStyle.Link)
        ];
        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
        return {
            content,
            allowedMentions: { parse: ["users"] },
            files: [file],
            embeds,
            components: [buttonRow]
        };
    },
    update(review: IPlaytestReview, user: User): BaseMessageOptions {
        const content = "### Review Updated"
        + `\n<@${user.discordId}> has updated this review.`
        + "\nContact the reviewer if you wish to know what exactly was updated.";

        const starterButton = new ButtonBuilder()
            .setLabel("View Current Review")
            .setURL(review.discord.messageUrl)
            .setStyle(ButtonStyle.Link);

        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents([starterButton]);
        return {
            content,
            components: [buttonRow]
        };
    }
};