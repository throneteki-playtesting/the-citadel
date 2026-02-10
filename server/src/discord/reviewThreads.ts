import { BaseMessageOptions, EmbedBuilder, ForumChannel, Guild, GuildForumTag, GuildMember, Message } from "discord.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { cardAsAttachment, colors, discordify, emojis, icons } from "./utilities";
import ejs from "ejs";
import { dataService, discordService, logger } from "@/services";
import { IPlaytestReview, StatementQuestions } from "common/models/reviews";
import { factions } from "common/models/cards";
import PlaytestingCard from "@/data/models/cards/playtestingCard";
import { IProject } from "common/models/projects";

export default class ReviewThreads {
    public static async sync(guild: Guild, canCreate: boolean, ...reviews: IPlaytestReview[]) {
        const created: IPlaytestReview[] = [];
        const updated: IPlaytestReview[] = [];
        const failed: IPlaytestReview[] = [];

        const titleFunc = (card: PlaytestingCard, review: IPlaytestReview) => `${card.number} | ${card.toString()} - ${review.reviewer}`;
        try {
            const projects = await dataService.projects.read(reviews.map((review) => ({ number: review.number })));
            const { channel, projectTags, factionTags } = await ReviewThreads.validateGuild(guild, ...projects);

            const findReviewThreadFor = async (card: PlaytestingCard, review: IPlaytestReview) => await discordService.findForumThread(channel, (thread) => thread.appliedTags.some((tag) => projectTags[review.project].id === tag) && thread.name === titleFunc(card, review));
            const autoArchiveDuration = channel.defaultAutoArchiveDuration;

            for (const review of reviews) {
                try {
                    const [card] = await dataService.cards.collection({ number: review.number, version: review.version });
                    const project = projects.find((p) => p.number === card.number);
                    let thread = await findReviewThreadFor(card, review);
                    const threadTitle = titleFunc(card, review);
                    const tags = [projectTags[review.project].id, factionTags[card.faction].id];
                    const member = await discordService.findMemberByName(guild, review.reviewer);

                    if (!thread) {
                        // Prevent review thread from being created, but warn it was attempted
                        if (!canCreate) {
                            logger.warning(`Review thread missing for ${review.toString()}, but thread creation not allowed`);
                            continue;
                        }

                        const reason = `Playtesting Review by ${review.reviewer} for ${card.toString()}`;
                        const message = ReviewThreads.generateInitial(review, card, project, member);
                        thread = await channel.threads.create({
                            name: threadTitle,
                            reason,
                            message,
                            appliedTags: tags,
                            autoArchiveDuration
                        });

                        // Pin the first message of the newly-created thread
                        const starterMessage = await thread.fetchStarterMessage();
                        await starterMessage.pin();

                        created.push(review);
                    } else {
                        const starter = await thread.fetchStarterMessage();
                        const message = ReviewThreads.generateInitial(review, card, project, member);

                        const promises: Map<string, Promise<unknown>> = new Map();
                        const changedAnswers = this.getChangedAnswers(starter, message);
                        // Update Title
                        if (thread.name !== threadTitle) {
                            promises.set("Title", thread.setName(threadTitle));
                        }
                        if (starter.content !== message.content || changedAnswers.length > 0) {
                            promises.set("Message content", starter.edit(message));
                        }
                        // Update pinned-ness
                        if (!starter.pinned && starter.pinnable) {
                            // Accounting for a possible Discord bug here: for some unknown reason, starter.pin() is causing an exception
                            // to be thrown below at "await thread.setArchived(false)" saying it cannot pin as the thread is archived.
                            // This is happening prior to this promise actually running, but re-fetching the starter message and pinning
                            // that seems to resolve it. Strange, but it works.
                            promises.set("Pinned", thread.fetchStarterMessage().then((msg) => msg.pin()));
                        }
                        // Update tags
                        if (thread.appliedTags.length !== tags.length || tags.some((lt) => !thread.appliedTags.includes(lt))) {
                            promises.set("Tags", thread.setAppliedTags(tags));
                        }
                        // Update auto archive duration
                        if (autoArchiveDuration && thread.autoArchiveDuration !== autoArchiveDuration) {
                            promises.set("Auto Archive Duration", thread.setAutoArchiveDuration(autoArchiveDuration));
                        }

                        if (promises.size > 0) {
                            // If thread is currently archived, unarchive & re-archive before/after adjustments are made
                            if (thread.archived) {
                                await thread.setArchived(false);
                                await Promise.allSettled(promises.values());
                                await thread.setArchived(true);
                            } else {
                                await Promise.allSettled(promises.values());
                            }

                            if (changedAnswers.length > 0) {
                                const updatedMessage = ReviewThreads.generateUpdated(review, card, project, changedAnswers, member);
                                await thread.send(updatedMessage);
                            }
                            updated.push(review);
                            logger.verbose(`Updated the following for ${review.toString()} review thread: ${Array.from(promises.keys()).join(", ")}`);
                        }
                    }
                } catch (err) {
                    logger.error(err);
                    failed.push(review);
                }
            }
        } catch (err) {
            throw Error(`Failed to sync card threads for forum "${guild.name}"`, { cause: err });
        }

        return { created, updated, failed };
    }

    private static async validateGuild(guild: Guild, ...projects: IProject[]) {
        const forumName = "playtesting-reviews";

        const errors = [];
        // Check forum channel exists
        const channel = guild.channels.cache.find((c) => c instanceof ForumChannel && c.name.endsWith(forumName)) as ForumChannel;
        if (!channel) {
            errors.push(`"${forumName}" channel does not exist or is not a forum`);
        }

        const projectTags = {} as { [projectId: string]: GuildForumTag };
        for (const project of projects) {
            // Check project tag exists
            const projectTag = channel?.availableTags.find((t) => t.name === project.code);
            if (!projectTag) {
                errors.push(`"${project.code}" tag is missing on forum "${channel?.name}"`);
            } else {
                projectTags[project.code] = projectTag;
            }
        }

        const factionTags = {} as { [faction: string]: GuildForumTag };
        for (const faction of factions) {
            const factionTag = channel?.availableTags.find((t) => t.name === faction);
            if (!factionTag) {
                errors.push(`"${faction}" tag is missing on Forum channel "${channel?.name}"`);
            } else {
                factionTags[faction] = factionTag;
            }
        }

        if (errors.length > 0) {
            throw Error(`Guild validation failed: ${errors.join(", ")}`);
        }

        return { channel, projectTags, factionTags };
    }

    private static generateInitial(review: IPlaytestReview, card: PlaytestingCard, project: IProject, member?: GuildMember) {
        try {
            const content = ReviewThreads.renderTemplate({ review, card, project, member, template: "initial" });
            const allowedMentions = { parse: ["users"] };
            const image = cardAsAttachment(card);
            // Segments the decks string into rows of 3, separated by ", "
            const decksString = review.decks.map((deck, index, decks) => `[Deck ${index + 1}](${deck})${(index + 1) === decks.length ? "" : ((index + 1) % 3 ? ", " : "\n")}`).join("");
            // IMPORTANT: If the structure of these embeds is to change, review/update "getChangedAnswers" function
            const embeds = [
                new EmbedBuilder()
                    .setAuthor({ name: `Review by ${review.reviewer}`, iconURL: icons.reviewer })
                    .setColor(colors.Review)
                    .setFields([
                        {
                            name: "✦ ThronesDB Deck(s)",
                            value: decksString,
                            inline: true
                        },
                        {
                            name: "✦ Games played",
                            value: review.played.toString(),
                            inline: true
                        },
                        {
                            name: "✦ Submit your own!",
                            value: `[Click here](${project.formUrl})`,
                            inline: true
                        },
                        {
                            name: "✦ Statements (agree/disagree)",
                            value: discordify(Object.entries(review.statements).map(([statement, answer]) => `- <b>${StatementQuestions[statement]}</b>: <i>${answer}</i> ${emojis[answer]}`).join("\n")),
                            inline: true
                        }
                    ])
            ];

            if (review.additional && review.additional.length > 1024) {
                embeds.push(new EmbedBuilder()
                    .setAuthor({ name: "✦ Additional Comments (extended)" })
                    .setColor(colors.Review)
                    .setDescription(review.additional));
            } else {
                embeds[0].addFields([{
                    name: "✦ Additional Comments",
                    value: review.additional || discordify("<i>None provided</i>")
                }]);
            }

            // Put timestamp on last embed
            embeds[embeds.length - 1].setTimestamp(new Date(review.created));

            return {
                content,
                files: [image],
                allowedMentions,
                embeds
            } as BaseMessageOptions;
        } catch (err) {
            throw new Error(`Failed to generate initial discord review message for ${review.toString()}`, { cause: err });
        }
    }

    private static generateUpdated(review: IPlaytestReview, card: PlaytestingCard, project: IProject, changed: string[], member: GuildMember) {

        try {
            const content = ReviewThreads.renderTemplate({ review, card, project, member, changed, template: "updated" });
            const allowedMentions = { parse: ["users"] };
            return {
                content,
                allowedMentions
            } as BaseMessageOptions;
        } catch (err) {
            throw new Error(`Failed to generate update discord review message for ${review.toString()}`, { cause: err });
        }
    }

    /**
     * Compares a starter message with the current generated one, and gathers any answers which have changed
     * IMPORTANT: If the structure of a review is to change, this needs to be updated.
     * @param starter The existing starter message
     * @param current The current message that was generated
     * @returns A string array of what had changed, or an empty array for no changes
     */
    private static getChangedAnswers(starter: Message<true>, current: BaseMessageOptions) {
        const oldEmbeds = starter.embeds;
        // Casting as EmbedBuilder as built message will always be an array of that, but TS does not deem it accurate
        const currentEmbeds = current.embeds.map((e) => e as EmbedBuilder);
        const changed: string[] = [];
        const decks1 = oldEmbeds[0].fields[0].value;
        const decks2 = currentEmbeds[0].data.fields[0].value;
        if (decks1 !== decks2) {
            changed.push(`ThronesDB Deck(s): <i>${decks1} -> ${decks2}</i>`);
        }
        const played1 = oldEmbeds[0].fields[1].value;
        const played2 = currentEmbeds[0].data.fields[1].value;
        if (played1 !== played2) {
            changed.push(`Games Played: <i>${played1} -> ${played2}</i>`);
        }
        const statements1 = oldEmbeds[0].fields[3].value;
        const statements2 = currentEmbeds[0].data.fields[3].value;
        if (statements1 !== statements2) {
            changed.push("Statements (agree/disagree): <i>Adjusted</i>");
        }
        const additional1 = oldEmbeds[0].fields.length > 4 ? oldEmbeds[0].fields[4].value : oldEmbeds[1].description;
        const additional2 = currentEmbeds[0].data.fields.length > 4 ? currentEmbeds[0].data.fields[4].value : currentEmbeds[1].data.description;
        if (additional1 !== additional2) {
            changed.push("Additional Comments: <i>Adjusted</i>");
        }
        return changed;
    }

    private static renderTemplate(data: ejs.Data) {
        const { template, ...restData } = data;
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const filePath = `${__dirname}/templates/reviewThreads/${template}.ejs`;
        const file = fs.readFileSync(filePath).toString();

        const render = ejs.render(file, { filename: filePath, emojis, icons, ...restData });

        return discordify(render);
    }
}