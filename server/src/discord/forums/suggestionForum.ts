import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    DiscordAPIError,
    ForumChannel,
    Guild,
    GuildForumTag,
    GuildForumThreadMessageCreateOptions,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageEditOptions,
    MessageFlags,
    resolveColor,
    RESTJSONErrorCodes,
    SeparatorBuilder,
    TextDisplayBuilder,
    ThreadChannel
} from "discord.js";
import { Mutex } from "async-mutex";
import { isEqual, merge } from "lodash-es";
import { colors, extractFromURL } from "../utils";
import { Code, countReactionsByType, ICardSuggestion } from "common/models/cards";
import { dataService, discordService, logger, thronesDbCardPoolService } from "@/services";
import { factionNames, renderCardSuggestion, THRONESDB_URL } from "common/utils";
import { asPNG } from "@/rendering";
import { REWARD_TYPES } from "common/designGuidelines/rewardTypes";
import { PUNISHMENT_TYPES } from "common/designGuidelines/punishmentTypes";
import { checklistRules } from "common/designGuidelines/checklistRules";
import { createSyncEmitter } from "@/services/sseService";
import { toDiscord } from "common/richText/toDiscord";

const FORUM_NAME = "suggestion-forum";
// Discord's own cap on a thread's name
const THREAD_NAME_MAX = 100;
// Shared with server/src/discord/buttons/, which routes a click back here by this customId prefix
export const SUGGESTION_REACTION_PREFIX = "suggestion-reaction";

const syncSuggestionForumMutex = new Mutex();

/** Shallow snapshot of the fields the "what changed" edit notice watches - deliberately not the whole
 *  suggestion, so an edit to eg. pivotPoints or comparableCards never triggers a changed-fields message. */
interface WatchedSnapshot {
    [key: string]: unknown;
    name: string;
    text: string;
    cost?: unknown;
    faction: string;
    type: string;
    questions: unknown;
}
const WATCHED_LABELS: Record<keyof WatchedSnapshot, string> = {
    name: "Name",
    text: "Ability Text",
    cost: "Cost",
    faction: "Faction",
    type: "Type",
    questions: "Questions"
};
function watchedSnapshot(suggestion: ICardSuggestion): WatchedSnapshot {
    return {
        name: suggestion.card.name,
        text: suggestion.card.text,
        cost: suggestion.card.cost,
        faction: suggestion.card.faction,
        type: suggestion.card.type,
        questions: suggestion.questions
    };
}
/** Labels only, never values - the caller decides what to do with them */
function diffSnapshot(previous: Record<string, unknown> | undefined, current: Record<string, unknown>): string[] {
    if (!previous) {
        return [];
    }
    return (Object.keys(WATCHED_LABELS) as (keyof WatchedSnapshot)[])
        .filter((key) => !isEqual(previous[key], current[key]))
        .map((key) => WATCHED_LABELS[key]);
}

/**
 * Syncs a batch of submitted suggestions to their forum threads - creating one where none exists yet,
 * otherwise refreshing the starter message in place and posting a changed-fields notice when warranted.
 */
export async function syncSuggestionForum(
    suggestions: ICardSuggestion[],
    forced?: boolean
): Promise<ICardSuggestion[]> {
    const release = await syncSuggestionForumMutex.acquire();
    // Created and started before the context resolves, so a context failure still fails them properly.
    const emitters = new Map(suggestions.map((s) => [s, createSyncEmitter("suggestion", "discord", s)]));
    emitters.forEach((emitter) => emitter.start());
    try {
        const context = await getSuggestionForumContext();

        const results: ICardSuggestion[] = [];
        for (const suggestion of suggestions) {
            results.push(await syncSuggestionThread(suggestion, context, emitters.get(suggestion)!, forced));
            emitters.delete(suggestion);
        }
        return results;
    } catch (err) {
        // Only reached by the context resolution above - per-suggestion failures are already handled.
        emitters.forEach((emitter) => emitter.error("Failure"));
        throw err;
    } finally {
        release();
    }
}

async function syncSuggestionThread(
    suggestion: ICardSuggestion,
    context: SuggestionForumContext,
    emitter: ReturnType<typeof createSyncEmitter<"suggestion">>,
    forced: boolean = false
): Promise<ICardSuggestion> {
    try {
        if (forced || isMessageOutdated(suggestion)) {
            const messageExists = !!suggestion._metadata?.discord?.messageUrl;
            if (messageExists) {
                emitter.progress("Refreshing");
                logger.info(`[Discord] Refreshing suggestion thread for "${suggestion.card.name}" (${suggestion.id})`);
                suggestion = await refreshSuggestionThread(suggestion, context);
            } else {
                emitter.progress("Creating");
                logger.info(`[Discord] Creating suggestion thread for "${suggestion.card.name}" (${suggestion.id})`);
                suggestion = await createSuggestionThread(suggestion, context);
            }
            [suggestion] = await dataService.suggestions.update([suggestion], true, false, false);
            logger.verbose(
                `[Discord] Synced suggestion "${suggestion.card.name}" (${suggestion.id}): ${suggestion._metadata?.discord?.messageUrl}`
            );
        }
        emitter.complete(suggestion);
    } catch (err) {
        emitter.error("Failure");
        logger.warn(
            new Error(`[Discord] Failed to sync suggestion "${suggestion.card.name}" (${suggestion.id})`, {
                cause: err
            })
        );
    }
    return suggestion;
}

function isMessageOutdated(suggestion: ICardSuggestion) {
    return !suggestion._metadata?.discord?.lastSynced || suggestion.updated > suggestion._metadata.discord.lastSynced;
}

async function createSuggestionThread(
    suggestion: ICardSuggestion,
    context: SuggestionForumContext
): Promise<ICardSuggestion> {
    const { options, snapshot } = await buildStarterMessage(suggestion);
    const tag = context.factionTags[suggestion.card.faction];

    const thread = await context.channel.threads.create({
        name: threadNameFor(suggestion),
        reason: `Suggestion discussion for ${suggestion.card.name} (submitted by ${suggestion.user.displayname})`,
        message: options,
        appliedTags: tag ? [tag.id] : [],
        autoArchiveDuration: context.channel.defaultAutoArchiveDuration
    });

    const starter = await thread.fetchStarterMessage();
    await starter.pin();

    merge(suggestion, {
        _metadata: { discord: { messageUrl: starter.url, lastSynced: new Date(), lastSyncedSnapshot: snapshot } }
    });
    return suggestion;
}

async function refreshSuggestionThread(
    suggestion: ICardSuggestion,
    context: SuggestionForumContext
): Promise<ICardSuggestion> {
    const { channelId, messageId } = extractFromURL(suggestion._metadata.discord.messageUrl);
    const channel = await context.guild.channels.fetch(channelId);
    if (!channel?.isThread()) {
        throw new Error(`Found channel is not a thread with id: ${channelId}`);
    }
    if (channel.archived) {
        await channel.setArchived(false);
    }

    const message = await channel.messages.fetch(messageId);
    const { options, snapshot } = await buildStarterMessage(suggestion);
    await message.edit(options as MessageEditOptions);

    const changed = diffSnapshot(suggestion._metadata?.discord?.lastSyncedSnapshot, snapshot);
    if (changed.length > 0) {
        await channel.send(updatedNotice(suggestion, changed));
    }

    merge(suggestion, { _metadata: { discord: { lastSynced: new Date(), lastSyncedSnapshot: snapshot } } });
    return suggestion;
}

/** Edits the reaction buttons' labels in place - never a full rebuild, since that re-renders and
 *  re-uploads the card image for what's only ever a count change. */
export async function onSuggestionReactionChanged(suggestion: ICardSuggestion) {
    await withSuggestionThread(suggestion, async (thread) => {
        const starter = await thread.fetchStarterMessage();
        if (!starter) {
            return;
        }
        const container = await buildContainer(suggestion, suggestionImageFilename(suggestion));
        await starter.edit({ components: [container] });
    });
}

export function suggestionImageFilename(suggestion: ICardSuggestion): string {
    return `${suggestion.id}.png`;
}

/** Posts who approved (or that approval was revoked) - the only two engagement events that reach Discord */
export async function onSuggestionApproved(suggestion: ICardSuggestion) {
    await withSuggestionThread(suggestion, async (thread) => {
        const approvedBy = suggestion._metadata?.engagement?.approvedBy;
        const heading = `### ✅ Suggestion Approved\n<@${approvedBy}> approved this suggestion.`;
        await thread.send(notice(suggestion, heading, ["users"]));
    });
}

export async function onSuggestionUnapproved(suggestion: ICardSuggestion) {
    await withSuggestionThread(suggestion, async (thread) => {
        const heading = "### Approval Removed\nThis suggestion's approval has been revoked.";
        await thread.send(notice(suggestion, heading, []));
    });
}

/** Says the suggestion is gone, then locks+archives - never deletes the thread, which holds the discussion */
export async function onSuggestionDeleted(suggestion: ICardSuggestion) {
    await withSuggestionThread(suggestion, async (thread) => {
        const container = new ContainerBuilder()
            .setAccentColor(resolveColor(colors[suggestion.card.faction]))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    "### Suggestion Deleted\nThis suggestion has been deleted and no longer stands for consideration."
                )
            );
        await thread.send({
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] },
            components: [container]
        });
        await thread.setLocked(true);
        await thread.setArchived(true);
        logger.info(`[Discord] Closed deleted suggestion thread for "${suggestion.card.name}" (${suggestion.id})`);
    });
}

/**
 * Silently archives the threads of suggestions that have just been archived (eg. consumed by a project at
 * initialise time) - no notice, unlike every other transition here.
 */
export async function closeSuggestionThreads(suggestions: ICardSuggestion[]) {
    const release = await syncSuggestionForumMutex.acquire();
    try {
        for (const suggestion of suggestions) {
            const messageUrl = suggestion._metadata?.discord?.messageUrl;
            if (!messageUrl) {
                continue;
            }
            try {
                const thread = await fetchThread(messageUrl);
                if (thread && !thread.archived) {
                    await thread.setArchived(true);
                    logger.info(
                        `[Discord] Archived suggestion thread for "${suggestion.card.name}" (${suggestion.id})`
                    );
                }
            } catch (err) {
                logger.warn(
                    new Error(
                        `[Discord] Failed to archive suggestion thread for "${suggestion.card.name}" (${suggestion.id})`,
                        { cause: err }
                    )
                );
            }
        }
    } finally {
        release();
    }
}

/** Clears the stored thread of a suggestion whose thread was deleted from Discord, so it can sync again */
export async function onSuggestionForumMessageDeleted(messageUrl: string) {
    logger.info(`[Discord] Forum thread message deleted: ${messageUrl}`);

    let suggestions = await dataService.suggestions.read({ _metadata: { discord: { messageUrl } } });
    if (suggestions.length === 0) {
        return;
    }

    for (const suggestion of suggestions) {
        if (suggestion._metadata) {
            delete suggestion._metadata.discord;
        }
    }
    suggestions = await dataService.suggestions.update(suggestions, true, false, false);

    logger.info(`[Discord] Removed discord metadata for ${suggestions.length} suggestion(s)`);
}

interface SuggestionForumContext {
    guild: Guild;
    channel: ForumChannel;
    factionTags: Record<string, GuildForumTag>;
}

async function getSuggestionForumContext(): Promise<SuggestionForumContext> {
    const guild = await discordService.getGuild();
    const errors: string[] = [];

    const channel = guild.channels.cache.find(
        (c) => c instanceof ForumChannel && c.name.endsWith(FORUM_NAME)
    ) as ForumChannel;
    if (!channel) {
        errors.push(`"${FORUM_NAME}" channel does not exist or is not a forum`);
    }

    const factionTags: Record<string, GuildForumTag> = {};
    for (const [faction, name] of Object.entries(factionNames)) {
        const factionTag = channel?.availableTags.find((t) => t.name === name);
        if (!factionTag) {
            errors.push(`"${name}" tag is missing on forum "${FORUM_NAME}"`);
        } else {
            factionTags[faction] = factionTag;
        }
    }

    if (errors.length > 0) {
        throw new Error(`Failed to build context: ${errors.join(", ")}`);
    }

    return { guild, channel, factionTags };
}

/**
 * Runs something against a suggestion's thread, if it has one. Every caller is following a decision
 * already saved, so a failure is logged and swallowed rather than refusing what it was recording.
 */
async function withSuggestionThread(suggestion: ICardSuggestion, action: (thread: ThreadChannel) => Promise<void>) {
    const messageUrl = suggestion._metadata?.discord?.messageUrl;
    if (!messageUrl) {
        return;
    }

    try {
        const thread = await fetchThread(messageUrl);
        if (!thread) {
            return;
        }
        if (thread.archived) {
            await thread.setArchived(false);
        }
        await action(thread);
    } catch (err) {
        logger.warn(
            new Error(`[Discord] Failed to update suggestion thread for "${suggestion.card.name}" (${suggestion.id})`, {
                cause: err
            })
        );
    }
}

/** The thread behind a stored url, or undefined where it has since been deleted */
async function fetchThread(messageUrl: string) {
    const { messageId: threadId } = extractFromURL(messageUrl);
    const guild = await discordService.getGuild();
    try {
        const channel = await guild.channels.fetch(threadId);
        if (!channel?.isThread()) {
            return undefined;
        }
        return channel;
    } catch (err) {
        if (err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.UnknownChannel) {
            return undefined;
        }
        throw err;
    }
}

function threadNameFor(suggestion: ICardSuggestion) {
    const name = suggestion.card.name;
    return name.length > THREAD_NAME_MAX ? `${name.slice(0, THREAD_NAME_MAX - 1)}…` : name;
}

function viewOnCitadelButton(suggestion: ICardSuggestion) {
    return new ButtonBuilder()
        .setLabel("View on Citadel")
        .setURL(`${process.env.CLIENT_HOST}/suggestions/${suggestion.id}`)
        .setStyle(ButtonStyle.Link);
}

function addSuggestionButton() {
    return new ButtonBuilder()
        .setLabel("Add your own suggestion")
        .setURL(`${process.env.CLIENT_HOST}/suggestions`)
        .setStyle(ButtonStyle.Link);
}

function suggestionButton(suggestion: ICardSuggestion) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(viewOnCitadelButton(suggestion));
}

function notice(suggestion: ICardSuggestion, heading: string, mentions: ("users" | "roles")[]) {
    const container = new ContainerBuilder()
        .setAccentColor(resolveColor(colors[suggestion.card.faction]))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(heading))
        .addActionRowComponents(suggestionButton(suggestion));

    return {
        flags: MessageFlags.IsComponentsV2 as const,
        allowedMentions: { parse: mentions },
        components: [container]
    };
}

function updatedNotice(suggestion: ICardSuggestion, changed: string[]) {
    const heading = `### Suggestion Updated\n<@${suggestion.updatedBy}> updated: **${changed.join(", ")}**`;
    return notice(suggestion, heading, ["users"]);
}

function labelsFor(options: { id: string; label: string }[], ids: string[]): string[] {
    return ids.map((id) => options.find((option) => option.id === id)?.label ?? id);
}

/** Resolves ThronesDB codes to a masked link to the card's page, falling back to the bare code where
 *  one doesn't resolve - same tolerance the client's own ComparableCombosSection shows for that case. */
async function resolveCardLinks(codes: string[]): Promise<string[]> {
    if (codes.length === 0) {
        return [];
    }
    const { items } = await thronesDbCardPoolService.search(
        { code: { $in: codes as Code[] } },
        undefined,
        1,
        codes.length
    );
    const byCode = new Map(items.filter((card) => card.code).map((card) => [card.code as string, card.label]));
    return codes.map((code) => {
        const name = byCode.get(code);
        return name ? `[${name}](${THRONESDB_URL}/card/${code})` : code;
    });
}

/** One plain count rather than a per-rule breakdown - `SlimChecklistNotice` already owns the detailed view */
async function checklistSummary(suggestion: ICardSuggestion): Promise<string | undefined> {
    const plotMedian = await thronesDbCardPoolService.getPlotMedianForCardType(suggestion.card.type);
    const results = checklistRules({
        card: suggestion.card,
        questions: suggestion.questions,
        derived: suggestion.derived,
        pivotPoints: suggestion.pivotPoints,
        plotMedian
    });
    if (results.length === 0) {
        return undefined;
    }
    const passed = results.filter((r) => r.status === "pass").length;
    const flagged = results.filter((r) => r.status === "warn").length;
    const parts = [passed > 0 && `${passed} passed`, flagged > 0 && `${flagged} flagged`].filter(Boolean) as string[];
    return parts.length > 0 ? parts.join(", ") : undefined;
}

/** Renders as two icon-led groups (details, then context) separated by a rule, plus a checklist line -
 *  each only shown when it has content. */
async function addSuggestionDetails(container: ContainerBuilder, suggestion: ICardSuggestion): Promise<void> {
    const answers: string[] = [];
    const rewardLabels = labelsFor(REWARD_TYPES, suggestion.questions.rewardTypes);
    if (rewardLabels.length > 0) {
        answers.push(`🎁 **Reward Types:** ${rewardLabels.join(", ")}`);
    }
    const punishmentLabels = labelsFor(PUNISHMENT_TYPES, suggestion.questions.punishment);
    if (punishmentLabels.length > 0) {
        answers.push(`⚠️ **Punishment:** ${punishmentLabels.join(", ")}`);
    }
    if (suggestion.questions.naturalTrigger !== undefined) {
        answers.push(`🎯 **Natural Trigger:** ${suggestion.questions.naturalTrigger ? "Yes" : "No"}`);
    }
    if (suggestion.questions.repeatabilityRestricted !== undefined) {
        answers.push(`🔁 **Safely Limited:** ${suggestion.questions.repeatabilityRestricted ? "Yes" : "No"}`);
    }

    const context: string[] = [];
    if (suggestion.pivotPoints.length > 0) {
        context.push(`📌 **Pivot Points**\n${suggestion.pivotPoints.map((point) => `- ${point}`).join("\n")}`);
    }
    const comparableLinks = await resolveCardLinks(suggestion.comparableCards);
    if (comparableLinks.length > 0) {
        context.push(`🔍 **Comparable Cards:** ${comparableLinks.join(", ")}`);
    }
    const comboLinks = await resolveCardLinks(suggestion.combosWith);
    if (comboLinks.length > 0) {
        context.push(`🤝 **Combos With:** ${comboLinks.join(", ")}`);
    }

    const checklist = await checklistSummary(suggestion);

    let hasPriorSection = false;
    const addSection = (content: string) => {
        if (hasPriorSection) {
            container.addSeparatorComponents(new SeparatorBuilder());
        }
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
        hasPriorSection = true;
    };

    if (answers.length > 0) {
        addSection(`### Design Details\n${answers.join("\n")}`);
    }
    if (context.length > 0) {
        addSection(`### Design Context\n${context.join("\n")}`);
    }
    if (checklist) {
        addSection(`✅ **Design Checklist:** ${checklist}`);
    }
}

/** The two live-count reaction buttons - a click resolves back to its suggestion via the clicked
 *  message's own url (see server/src/discord/buttons/suggestionReaction.ts), never a suggestion id here. */
function buildReactionRow(suggestion: ICardSuggestion): ActionRowBuilder<ButtonBuilder> {
    const reactions = suggestion._metadata?.engagement?.reactions;
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`${SUGGESTION_REACTION_PREFIX}:like`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("👍")
            .setLabel(String(countReactionsByType(reactions, "like"))),
        new ButtonBuilder()
            .setCustomId(`${SUGGESTION_REACTION_PREFIX}:dislike`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("👎")
            .setLabel(String(countReactionsByType(reactions, "dislike")))
    );
}

/** Everything but the rendered card image - lets a reaction-only change refresh the button labels
 *  without re-rendering/re-uploading the PNG. */
export async function buildContainer(suggestion: ICardSuggestion, filename: string): Promise<ContainerBuilder> {
    const heading = `## Card Suggestion\n<@${suggestion.user.discordId}> has submitted **${suggestion.card.name}** for consideration.`;
    const container = new ContainerBuilder()
        .setAccentColor(resolveColor(colors[suggestion.card.faction]))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(heading));

    if (suggestion.notes) {
        const emojis = await discordService.getEmojiMap();
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(toDiscord(suggestion.notes, { emojis }))
        );
    }

    container
        .addSeparatorComponents(new SeparatorBuilder())
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${filename}`))
        )
        .addSeparatorComponents(new SeparatorBuilder());

    await addSuggestionDetails(container, suggestion);

    container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(viewOnCitadelButton(suggestion), addSuggestionButton())
    );
    container.addActionRowComponents(buildReactionRow(suggestion));

    return container;
}

async function buildStarterMessage(
    suggestion: ICardSuggestion
): Promise<{ options: GuildForumThreadMessageCreateOptions; snapshot: Record<string, unknown> }> {
    const filename = suggestionImageFilename(suggestion);
    const render = renderCardSuggestion(suggestion);
    const { buffer } = await asPNG(render);
    const attachment = new AttachmentBuilder(buffer, { name: filename });

    const container = await buildContainer(suggestion, filename);

    return {
        options: {
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: ["users"] },
            files: [attachment],
            components: [container]
        },
        snapshot: watchedSnapshot(suggestion)
    };
}
