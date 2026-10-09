import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ContainerBuilder,
    DiscordAPIError,
    ForumChannel,
    Guild,
    GuildForumTag,
    GuildForumTagData,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    OverwriteResolvable,
    OverwriteType,
    PermissionFlagsBits,
    PermissionsBitField,
    resolveColor,
    RateLimitError,
    RESTJSONErrorCodes,
    SeparatorBuilder,
    TextDisplayBuilder,
    ThreadChannel
} from "discord.js";
import { Mutex } from "async-mutex";
import { compact, isEmpty, omit } from "lodash-es";
import { createSyncEmitter, SyncEmitter } from "@/services/sseService";
import { SyncDataMap, SyncOperation } from "@/types";
import { factions } from "common/models/cards";
import Permission from "common/models/permissions";
import { IProject } from "common/models/projects";
import { IPlaytestCard } from "common/models/cards";
import { ISlot, orderByPreference, preferenceLabel } from "common/models/slots";
import { describeCondition, slotConditionIssues } from "common/models/slotConditions";
import { toDiscord } from "common/richText/toDiscord";
import { truncateHtml } from "common/richText/truncate";
import { factionNames, renderPlaytestingCard } from "common/utils";
import { dataService, discordService, logger } from "@/services";
import { getContext, requestContext } from "@/middleware/context";
import { asPNG } from "@/rendering";
import { colors, extractFromURL, unicodeEmojis } from "../utils";

const CATEGORY_NAME = "management";
const CLOSED_TAG_NAME = "Closed";
const FORUM_NAME_SUFFIX = "-planning";
const THREAD_NAME_MAX = 100;
const NOTES_MAX = 300;
// A message holds 40 components: the slot's card takes up to 9, the closing card 5, and each option 3
const OPTIONS_MAX = 7;
const GOLD_COLOR = 0xd4af37;
const SILVER_COLOR = 0xc0c0c0;
const BRONZE_COLOR = 0x8c5a2e;
const OPTION_COLORS = [GOLD_COLOR, SILVER_COLOR, BRONZE_COLOR];
const OTHER_OPTION_COLOR = 0x4a4f5c;
const ISSUES_MAX = 2;
const FORUM_ARCHIVE_MINUTES = 10080;
const BOT_ACCESS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.CreatePublicThreads,
    PermissionFlagsBits.ManageThreads,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles
];
const MEMBER_ACCESS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles
];
const CLOSED_COLOR = 0x6a6a6a;
const OPEN_COLOR = 0xc5a059;

// Creating a channel, or opening a thread, is what two requests can race into doing twice
const forumMutex = new Mutex();
const discussionMutex = new Mutex();

type SlotDiscord = NonNullable<NonNullable<ISlot["_metadata"]>["discord"]>;
// A sync which went through but couldn't do all it meant to, and when it can be tried again if that is known
type SyncProblem = { message: string; retryAt?: Date };
type SyncedType = "project" | "slot";

// The emoji sits straight against the code, as a channel name has no room for a space
export const planningForumName = (project: IProject) =>
    `${(project.emoji && unicodeEmojis[project.emoji]) || ""}${project.code.toLowerCase()}${FORUM_NAME_SUFFIX}`;

export const isPlanningForum = (name: string) => name.endsWith(FORUM_NAME_SUFFIX);

const needsSync = (updated: Date, lastSynced?: Date) => !lastSynced || new Date(updated) > new Date(lastSynced);

const isForumCurrent = (project: IProject, forced: boolean) => {
    const synced = project._metadata?.discord;
    return !project.draft || (!forced && !!synced?.forumUrl && !needsSync(project.updated, synced.lastSynced));
};

const rateLimited = (err: RateLimitError): SyncProblem => ({
    message: "Rate limited",
    retryAt: new Date(Date.now() + err.retryAfter)
});

// Reports a sync as it starts, and as a failure if the work throws
async function reporting<K extends SyncedType, T>(
    type: K,
    resource: SyncDataMap[K],
    work: (emitter: SyncEmitter<K>) => Promise<T>
): Promise<T> {
    const emitter = createSyncEmitter(type, "discord" as SyncOperation<K>, resource);
    emitter.start();
    try {
        return await work(emitter);
    } catch (err) {
        emitter.error("Failure");
        throw err;
    }
}

function finishSync<K extends SyncedType>(emitter: SyncEmitter<K>, synced: SyncDataMap[K], problems: SyncProblem[]) {
    if (problems.length > 0) {
        emitter.error(problems[0].message, problems[0].retryAt);
    } else {
        emitter.complete(synced);
    }
}

// Runs a call Discord may tell to wait, handing back the problem rather than throwing when it does
async function untilRateLimited(action: () => Promise<unknown>, what: string): Promise<SyncProblem | undefined> {
    try {
        await action();
    } catch (err) {
        if (!(err instanceof RateLimitError)) {
            throw err;
        }
        const minutes = Math.ceil(err.retryAfter / 60000);
        logger.warn(`[Discord] Can't ${what} for another ${minutes} minutes - it will be tried again on the next sync`);
        return rateLimited(err);
    }
}

// Runs work on each open slot that has a thread, logging rather than stopping at one that fails
async function forEachThread(project: IProject, work: (slot: ISlot) => Promise<unknown>) {
    const slots = await dataService.slots.read({ project: project.number });
    for (const slot of slots.filter((slot) => !slot.closed && slot._metadata?.discord?.messageUrl)) {
        try {
            await work(slot);
        } catch (err) {
            logger.warn(
                new Error(`[Discord] Failed to update planning discussion for ${project.code} #${slot.number}`, {
                    cause: err
                })
            );
        }
    }
}

/** Makes sure a draft project's planning forum exists and is right, unless it was synced since the project changed */
export async function syncPlanningForum(project: IProject, forced = false): Promise<IProject> {
    if (isForumCurrent(project, forced)) {
        return project;
    }
    const { project: synced, isRenamed } = await reporting("project", project, async (emitter) => {
        emitter.progress(project._metadata?.discord?.forumUrl ? "Updating forum" : "Creating forum");
        const ensured = await ensureForum(project);
        finishSync(emitter, ensured.project, ensured.problems);
        return ensured;
    });
    // A post names its project by emoji and code, so a forum which took a new name has posts to match
    if (isRenamed) {
        await forEachThread(synced, (slot) => syncSlotPost(synced, slot, true));
    }
    return synced;
}

/** Brings the access of every draft project's existing forum in line with the roles and owners it is meant for */
export async function syncPlanningForumAccess() {
    // One at a time, so the many role updates of a daily sync find the work already done rather than redoing it
    const release = await forumMutex.acquire();
    try {
        const guild = await discordService.getGuild();
        const projects = await dataService.projects.read({ draft: true });
        for (const project of projects) {
            try {
                const channel = await findForum(guild, project);
                if (channel) {
                    await syncAccess(guild, channel, project);
                }
            } catch (err) {
                logger.warn(
                    new Error(`[Discord] Failed to sync planning forum access for ${project.code}`, { cause: err })
                );
            }
        }
    } finally {
        release();
    }
}

/** Makes every draft project's forum, and any thread of its slots which has gone missing, whole again */
export async function syncAllPlanningForums() {
    const projects = await dataService.projects.read({ draft: true });
    for (const project of projects) {
        try {
            await syncProjectPlanning(project, true);
        } catch (err) {
            logger.warn(new Error(`[Discord] Failed to sync planning forum for ${project.code}`, { cause: err }));
        }
    }
}

/** One draft project's forum, made if it is missing, and the thread of each slot which has one made whole again */
export async function syncProjectPlanning(project: IProject, forced = false): Promise<IProject> {
    if (!project.draft) {
        return project;
    }
    const synced = await syncPlanningForum(project, forced);
    await forEachThread(synced, async (slot) => {
        await openSlotDiscussion(synced, slot);
        await syncSlotPost(synced, slot);
    });
    return (await dataService.projects.read({ number: project.number }))[0] ?? synced;
}

/** Takes a project's planning forum away with it, wherever it was left */
export async function deletePlanningForum(project: IProject) {
    try {
        const channel = await findForum(await discordService.getGuild(), project);
        await channel?.delete(`Project ${project.code} deleted`);
        if (channel) {
            logger.info(`[Discord] Deleted planning forum for ${project.code}`);
        }
    } catch (err) {
        logger.warn(new Error(`[Discord] Failed to delete planning forum for ${project.code}`, { cause: err }));
    }
}

/** Opens a thread for one slot, or hands back the one it has - making it again if it was deleted */
export async function openSlotDiscussion(
    project: IProject,
    slot: ISlot,
    startedBy?: string
): Promise<SlotDiscord | undefined> {
    const release = await discussionMutex.acquire();
    try {
        const [current] = await dataService.slots.read({ project: slot.project, number: slot.number });
        if (!current) {
            return undefined;
        }
        const existing = current._metadata?.discord;
        if (existing?.messageUrl && (await fetchThread(await discordService.getGuild(), existing.messageUrl))) {
            return existing;
        }

        const syncedAt = new Date();
        return await reporting("slot", current, async (emitter) => {
            emitter.progress("Creating");
            const { forum } = await ensureForum(project);
            // A thread made again keeps its first opener, without telling them a second time
            const openedBy = startedBy ?? existing?.startedBy;
            const cards = await dataService.cards.read({ project: current.project, number: current.number });
            const thread = await forum.threads.create({
                name: await threadName(current),
                reason: `Planning discussion for ${project.code} #${current.number}`,
                message: await buildPost(project, current, cards, openedBy, !!startedBy),
                appliedTags: tagIds(forum, factionNames[current.faction]),
                autoArchiveDuration: forum.defaultAutoArchiveDuration
            });

            logger.info(`[Discord] Opened planning discussion for ${project.code} #${current.number}`);
            // A forum thread's opening message carries the thread's id, so the one url stands for both
            const discord: SlotDiscord = {
                messageUrl: `https://discord.com/channels/${thread.guildId}/${thread.id}/${thread.id}`,
                ...(openedBy && { startedBy: openedBy }),
                lastSynced: syncedAt
            };
            emitter.complete(await dataService.slots.update(withDiscord(current, discord), true, false));
            return discord;
        });
    } finally {
        release();
    }
}

/** Answers a change to a slot: its thread is brought up to date, and a card arriving opens one if it has none */
export async function slotDiscussionChanged(projectNumber: number, slotNumber: number, opensThread = false) {
    // Only a person changing a slot answers it - not a sync, an import or a script
    const context = getContext();
    if (context.source !== "client") {
        return;
    }
    // Detached, so the change reaches the page of whoever made it too
    await requestContext.run({ ...context, detached: true }, async () => {
        try {
            const [project] = await dataService.projects.read({ number: projectNumber });
            const [slot] = await dataService.slots.read({ project: projectNumber, number: slotNumber });
            if (!project?.draft || !slot || slot.closed) {
                return;
            }
            if (slot._metadata?.discord?.messageUrl) {
                await syncSlotPost(project, slot);
            } else if (
                opensThread &&
                (await dataService.cards.count({ project: projectNumber, number: slotNumber })) > 0
            ) {
                await openSlotDiscussion(project, slot);
            }
        } catch (err) {
            logger.warn(new Error(`[Discord] Failed to answer a change to slot #${slotNumber}`, { cause: err }));
        }
    });
}

// Brings a slot's thread name and post up to date - the post once the slot, or a card in it, changed since it was written
async function syncSlotPost(project: IProject, slot: ISlot, isForced = false) {
    const release = await discussionMutex.acquire();
    try {
        // Stamped as it starts, so a change made while it is written still finds the post stale
        const syncedAt = new Date();
        const [current] = await dataService.slots.read({ project: slot.project, number: slot.number });
        const discord = current?._metadata?.discord;
        if (!current || !discord?.messageUrl) {
            return;
        }
        const thread = await fetchThread(await discordService.getGuild(), discord.messageUrl);
        if (!thread) {
            return;
        }

        const name = await threadName(current);
        const cards = await dataService.cards.read({ project: current.project, number: current.number });
        const isStale =
            isForced ||
            [current.updated, ...cards.map((card) => card.updated)].some((changed) =>
                needsSync(changed, discord.lastSynced)
            );
        const isRenaming = thread.name !== name;
        if (!isStale && !isRenaming) {
            return;
        }

        await reporting("slot", current, async (emitter) => {
            const problems: SyncProblem[] = [];
            if (isRenaming) {
                emitter.progress("Renaming");
                const problem = await untilRateLimited(() => thread.setName(name), `rename ${thread.name} to ${name}`);
                problems.push(...compact([problem]));
            }

            let synced = current;
            const message = isStale ? await thread.fetchStarterMessage() : undefined;
            if (message) {
                emitter.progress("Updating post");
                if (thread.archived) {
                    await thread.setArchived(false);
                }
                await message.edit({
                    ...(await buildPost(project, current, cards, discord.startedBy, false)),
                    attachments: []
                });
                synced = await dataService.slots.update(
                    withDiscord(current, { ...discord, lastSynced: syncedAt }),
                    true,
                    false,
                    false
                );
                logger.info(`[Discord] Updated planning discussion for ${project.code} #${current.number}`);
            }
            finishSync(emitter, synced, problems);
        });
    } finally {
        release();
    }
}

/** Puts a closed slot's thread away - shut and tagged, but kept, since the slot may come back */
export async function closeSlotDiscussion(project: IProject, slot: ISlot) {
    await withThread(project, slot, async (thread, forum) => {
        await thread.send(notice(CLOSED_COLOR, ":lock: Slot Closed", "This slot has been closed.", project, slot));
        await thread.setAppliedTags(tagIds(forum, factionNames[slot.faction], CLOSED_TAG_NAME));
        await thread.setArchived(true);
    });
}

/** Opens a reopened slot's thread again */
export async function reopenSlotDiscussion(project: IProject, slot: ISlot) {
    await withThread(project, slot, async (thread, forum) => {
        await thread.setAppliedTags(tagIds(forum, factionNames[slot.faction]));
        await thread.send(notice(OPEN_COLOR, ":unlock: Slot Reopened", "This slot has been reopened.", project, slot));
    });
}

function withoutDiscord<T extends { _metadata?: object }>(entity: T): T {
    const metadata = omit(entity._metadata, "discord");
    return isEmpty(metadata) ? (omit(entity, "_metadata") as T) : { ...entity, _metadata: metadata };
}

// Forgets a project's forum deleted in Discord, and the threads of its slots which went with it
export async function onPlanningForumDeleted(channel: ForumChannel) {
    const forumUrl = `https://discord.com/channels/${channel.guildId}/${channel.id}`;
    const affected = await dataService.projects.read({ "_metadata.discord.forumUrl": forumUrl } as never);
    if (affected.length === 0) {
        return;
    }

    logger.info(`[Discord] Planning forum deleted: ${channel.name}`);
    await dataService.projects.update(affected.map(withoutDiscord), true, false);
    for (const project of affected) {
        const slots = await dataService.slots.read({ project: project.number });
        const threaded = slots.filter((slot) => slot._metadata?.discord);
        if (threaded.length > 0) {
            await dataService.slots.update(threaded.map(withoutDiscord), true, false);
        }
    }
}

// Forgets the thread of a slot deleted in Discord - it is made again when next started, by hand or by a card
export async function onPlanningForumMessageDeleted(messageUrl: string) {
    const affected = await dataService.slots.read({ "_metadata.discord.messageUrl": messageUrl } as never);
    if (affected.length === 0) {
        return;
    }

    logger.info(`[Discord] Planning discussion deleted: ${messageUrl}`);
    await dataService.slots.update(affected.map(withoutDiscord), true, false);
}

async function findForum(guild: Guild, project: IProject) {
    const channelId = project._metadata?.discord?.forumUrl?.match(/channels\/\d+\/(\d+)/)?.[1];
    if (channelId) {
        try {
            const channel = await guild.channels.fetch(channelId);
            if (channel instanceof ForumChannel) {
                return channel;
            }
        } catch (err) {
            if (!(err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.UnknownChannel)) {
                throw err;
            }
        }
    }
    // Adopted by name, so a forum whose url was never recorded isn't made twice
    const name = planningForumName(project);
    return guild.channels.cache.find(
        (channel): channel is ForumChannel => channel instanceof ForumChannel && channel.name === name
    );
}

// Discord allows a channel's name and topic two changes in ten minutes
async function renameForum(forum: ForumChannel, name: string, project: IProject) {
    return untilRateLimited(async () => {
        if (forum.name !== name) {
            logger.info(`[Discord] Renaming planning forum ${forum.name} to ${name}`);
            await forum.setName(name, `Project ${project.code} renamed`);
        }
        const topic = planningForumTopic(project);
        if (forum.topic !== topic) {
            await forum.setTopic(topic);
        }
    }, `rename planning forum to ${name}`);
}

// Faction tags wear the guild's emoji for them where there is one; existing tags keep their ids, and extra ones stay
function wantedTags(existing: readonly GuildForumTag[], emojis: Record<string, string>): GuildForumTagData[] {
    const tags: GuildForumTagData[] = existing.map((tag) => ({ ...tag }));
    for (const name of [...factions.map((faction) => factionNames[faction]), CLOSED_TAG_NAME]) {
        const faction = factions.find((candidate) => factionNames[candidate] === name);
        const emojiId = faction && emojis[faction]?.match(/^<a?:\w+:(\d+)>$/)?.[1];
        const tag = tags.find((candidate) => candidate.name === name) ?? tags[tags.push({ name }) - 1];
        if (emojiId) {
            tag.emoji = { id: emojiId, name: null };
        }
    }
    return tags;
}

async function syncTags(forum: ForumChannel) {
    const wanted = wantedTags(forum.availableTags, await discordService.getEmojiMap());
    const isSame =
        wanted.length === forum.availableTags.length &&
        wanted.every((tag) => {
            const existing = forum.availableTags.find(({ id }) => id === tag.id);
            return !!existing && (existing.emoji?.id ?? null) === (tag.emoji?.id ?? null);
        });
    if (isSame) {
        return undefined;
    }
    return untilRateLimited(async () => {
        await forum.setAvailableTags(wanted);
        logger.info(`[Discord] Updated the tags of planning forum ${forum.name}`);
    }, `update the tags of ${forum.name}`);
}

const planningForumTopic = (project: IProject) =>
    `Planning for ${project.name}, a thread for each slot which has something to decide`;

async function createForum(guild: Guild, project: IProject) {
    const category = guild.channels.cache.find(
        (channel) => channel.type === ChannelType.GuildCategory && channel.name.toLowerCase() === CATEGORY_NAME
    );
    if (!category) {
        logger.warn(`[Discord] No "${CATEGORY_NAME}" category found - planning forum for ${project.code} has none`);
    }
    const channel = await guild.channels.create({
        name: planningForumName(project),
        type: ChannelType.GuildForum,
        parent: category?.id,
        topic: planningForumTopic(project),
        defaultAutoArchiveDuration: FORUM_ARCHIVE_MINUTES,
        availableTags: wantedTags([], await discordService.getEmojiMap()),
        reason: `Planning forum for draft project ${project.code}`
    });
    logger.info(`[Discord] Created planning forum for ${project.code}`);
    return channel;
}

// Found or made, put right, and its url and sync time recorded on the project
async function ensureForum(project: IProject) {
    const release = await forumMutex.acquire();
    try {
        // Re-read, as the project a caller holds may be a save behind the one which recorded the forum
        const [stored] = await dataService.projects.read({ number: project.number });
        const current = stored ?? project;
        const guild = await discordService.getGuild();
        const forum = (await findForum(guild, current)) ?? (await createForum(guild, current));
        const isRenamed = forum.name !== planningForumName(current);
        const problems = compact([
            await renameForum(forum, planningForumName(current), current),
            await syncTags(forum)
        ]);
        await syncAccess(guild, forum, current);
        const synced = await dataService.projects.update(
            {
                ...current,
                _metadata: {
                    ...current._metadata,
                    discord: {
                        forumUrl: `https://discord.com/channels/${guild.id}/${forum.id}`,
                        // A sync which couldn't finish isn't one, so the next is not skipped
                        lastSynced: problems.length > 0 ? current._metadata?.discord?.lastSynced : new Date()
                    }
                }
            },
            true,
            false,
            false
        );
        return { forum, project: synced, isRenamed, problems };
    } finally {
        release();
    }
}

// Everybody is shut out but the roles who hold the permission and the project's owners, one by one. Compared first, so
// a project saved a hundred times with nothing changed costs no calls
async function syncAccess(guild: Guild, channel: ForumChannel, project: IProject) {
    const roles = (await dataService.roles.read({ active: true })).filter((role) =>
        role.permissions.includes(Permission.READ_DISCORD_PLANNING_FORUM)
    );
    const access = new Map<string, { type: OverwriteType; allow: bigint; deny: bigint }>();
    access.set(guild.roles.everyone.id, { type: OverwriteType.Role, allow: 0n, deny: PermissionFlagsBits.ViewChannel });
    const allow = (id: string, type: OverwriteType, permissions: bigint[]) =>
        access.set(id, { type, allow: permissions.reduce((total, permission) => total | permission, 0n), deny: 0n });

    roles.forEach((role) => allow(role.discordId, OverwriteType.Role, MEMBER_ACCESS));
    for (const owner of project.owners ?? []) {
        const member = await guild.members.fetch(owner).catch(() => undefined);
        if (member) {
            allow(member.id, OverwriteType.Member, MEMBER_ACCESS);
        }
    }
    if (guild.members.me) {
        allow(guild.members.me.id, OverwriteType.Member, BOT_ACCESS);
    }

    const current = channel.permissionOverwrites.cache;
    const isSame =
        current.size === access.size &&
        [...access].every(([id, wanted]) => {
            const existing = current.get(id);
            return (
                existing?.type === wanted.type &&
                existing.allow.bitfield === wanted.allow &&
                existing.deny.bitfield === wanted.deny
            );
        });
    if (isSame) {
        return;
    }

    const overwrites: OverwriteResolvable[] = [...access].map(([id, wanted]) => ({
        id,
        type: wanted.type,
        allow: new PermissionsBitField(wanted.allow),
        deny: new PermissionsBitField(wanted.deny)
    }));
    await channel.permissionOverwrites.set(overwrites, `Syncing access to ${project.code} planning forum`);
    logger.info(`[Discord] Synced access to ${project.code} planning forum`);
}

function withDiscord(slot: ISlot, discord: SlotDiscord): ISlot {
    return { ...slot, _metadata: { ...slot._metadata, discord } };
}

function tagIds(forum: ForumChannel, ...names: string[]) {
    return names
        .map((name) => forum.availableTags.find((tag): tag is GuildForumTag => tag.name === name)?.id)
        .filter((id): id is string => !!id);
}

// Its number, then which of its faction's cards it is - a thread's name can't draw the guild's emoji
async function threadName(slot: ISlot) {
    const before = await dataService.slots.count({
        project: slot.project,
        faction: slot.faction,
        number: { $lt: slot.number }
    });
    return `#${slot.number} · ${factionNames[slot.faction]} · Card ${before + 1}`.slice(0, THREAD_NAME_MAX);
}

function linkButtons(project: IProject, slot: ISlot) {
    const projectUrl = `${process.env.CLIENT_HOST}/project/${project.number}`;
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel("View Slot")
            .setURL(`${projectUrl}?slot=${slot.number}`)
            .setStyle(ButtonStyle.Link),
        new ButtonBuilder().setLabel("Open Project").setURL(projectUrl).setStyle(ButtonStyle.Link)
    );
}

function slotSummary(slot: ISlot, emojis: Record<string, string>) {
    const lines: string[] = [];
    if (slot.conditions?.length) {
        lines.push(`**Needs:** ${slot.conditions.map(describeCondition).join(" · ")}`);
    }
    if (slot.important) {
        lines.push(":star: Important addition");
    }
    if (slot.notes) {
        const notes = truncateHtml(slot.notes, NOTES_MAX, (html) => toDiscord(html, { emojis }).length);
        lines.push(toDiscord(notes, { emojis }));
    }
    return lines.join("\n");
}

// The slot's options in order of preference, each rendered as the app shows it
async function slotImages(slot: ISlot, cards: IPlaytestCard[]) {
    const options = orderByPreference(cards, slot.preferences);
    const shown = options.slice(0, OPTIONS_MAX);
    const renders = await asPNG(
        shown.map((card, rank) =>
            renderPlaytestingCard(card, {
                top: preferenceLabel(rank),
                middle: `Card #${slot.number}`,
                bottom: card.suggestionId ? "From Suggestion" : "New Design"
            })
        )
    );
    const files = renders.map(({ buffer }, rank) => new AttachmentBuilder(buffer, { name: `option-${rank + 1}.png` }));
    return { options, shown, files };
}

function optionContainer(slot: ISlot, card: IPlaytestCard, rank: number) {
    const issues = slotConditionIssues(slot.conditions, card);
    const label =
        `### ${preferenceLabel(rank)}` +
        (issues.length > 0 ? `\n:warning: ${issues.slice(0, ISSUES_MAX).join(" · ")}` : "");
    return new ContainerBuilder()
        .setAccentColor(OPTION_COLORS[rank] ?? OTHER_OPTION_COLOR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(label))
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder()
                    .setURL(`attachment://option-${rank + 1}.png`)
                    .setDescription(`${preferenceLabel(rank)}: ${card.name}`)
            )
        );
}

async function buildPost(
    project: IProject,
    slot: ISlot,
    cards: IPlaytestCard[],
    openedBy: string | undefined,
    isNotified: boolean
) {
    const emojis = await discordService.getEmojiMap();
    const { options, shown, files } = await slotImages(slot, cards);
    const factionColor = resolveColor(colors[slot.faction]);
    const houseEmoji = emojis[slot.faction];
    const heading =
        `## ${project.emoji ? `:${project.emoji}: ` : ""}${project.code} #${slot.number} · ${houseEmoji ? `${houseEmoji} ` : ""}${factionNames[slot.faction]}` +
        "\nThe maesters convene. What should this slot hold?";
    const summary = slotSummary(slot, emojis);

    const slotContainer = new ContainerBuilder()
        .setAccentColor(factionColor)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(heading));
    if (summary) {
        slotContainer
            .addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(summary));
    }
    if (openedBy) {
        slotContainer
            .addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`Discussion manually opened by <@${openedBy}>`)
            );
    }
    slotContainer.addSeparatorComponents(new SeparatorBuilder()).addActionRowComponents(linkButtons(project, slot));

    const optionContainers = shown.map((card, rank) => optionContainer(slot, card, rank));
    if (options.length > 0) {
        const closing = new ContainerBuilder().setAccentColor(factionColor);
        if (options.length > shown.length) {
            closing.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`+${options.length - shown.length} more options in the project`)
            );
        }
        closing.addActionRowComponents(linkButtons(project, slot));
        optionContainers.push(closing);
    }

    return {
        components: [slotContainer, ...optionContainers],
        files,
        flags: MessageFlags.IsComponentsV2 as const,
        allowedMentions: { users: openedBy && isNotified ? [openedBy] : [] }
    };
}

function notice(color: number, heading: string, body: string, project: IProject, slot: ISlot) {
    const container = new ContainerBuilder()
        .setAccentColor(color)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${heading}\n${body}`))
        .addActionRowComponents(linkButtons(project, slot));

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 as const,
        allowedMentions: { users: [] }
    };
}

// Runs something against a slot's thread if it has one, logging a failure rather than refusing the change behind it
async function withThread(
    project: IProject,
    slot: ISlot,
    action: (thread: ThreadChannel, forum: ForumChannel) => Promise<void>
) {
    const messageUrl = slot._metadata?.discord?.messageUrl;
    if (!messageUrl) {
        return;
    }

    try {
        const guild = await discordService.getGuild();
        const thread = await fetchThread(guild, messageUrl);
        if (!thread || !(thread.parent instanceof ForumChannel)) {
            return;
        }
        if (thread.archived) {
            await thread.setArchived(false);
        }
        await action(thread, thread.parent);
    } catch (err) {
        logger.warn(
            new Error(`[Discord] Failed to update planning discussion for ${project.code} #${slot.number}`, {
                cause: err
            })
        );
    }
}

// The thread behind a stored url, or undefined where it has since been deleted
async function fetchThread(guild: Guild, messageUrl: string) {
    const { messageId: threadId } = extractFromURL(messageUrl);
    try {
        const channel = await guild.channels.fetch(threadId);
        return channel?.isThread() ? channel : undefined;
    } catch (err) {
        if (err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.UnknownChannel) {
            return undefined;
        }
        throw err;
    }
}
