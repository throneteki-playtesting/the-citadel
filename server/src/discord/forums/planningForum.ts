import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ContainerBuilder,
    DiscordAPIError,
    ForumChannel,
    Guild,
    GuildForumTag,
    MessageFlags,
    OverwriteResolvable,
    OverwriteType,
    PermissionFlagsBits,
    PermissionsBitField,
    RESTJSONErrorCodes,
    SeparatorBuilder,
    TextDisplayBuilder,
    ThreadChannel
} from "discord.js";
import { Mutex } from "async-mutex";
import { isEmpty, omit } from "lodash-es";
import { factions } from "common/models/cards";
import Permission from "common/models/permissions";
import { IProject } from "common/models/projects";
import { ISlot } from "common/models/slots";
import { describeCondition } from "common/models/slotConditions";
import { toDiscord } from "common/richText/toDiscord";
import { truncateHtml } from "common/richText/truncate";
import { factionNames } from "common/utils";
import { dataService, discordService, logger } from "@/services";
import { getContext, requestContext } from "@/middleware/context";
import { extractFromURL } from "../utils";

const CATEGORY_NAME = "management";
const CLOSED_TAG_NAME = "Closed";
const FORUM_NAME_SUFFIX = "-planning";
// Discord's own cap on a thread's name
const THREAD_NAME_MAX = 100;
const NOTES_MAX = 300;
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

// Creating a channel, or opening a thread, is the one operation two requests can race into doing twice
const forumMutex = new Mutex();
const discussionMutex = new Mutex();

type SlotDiscord = NonNullable<NonNullable<ISlot["_metadata"]>["discord"]>;

export const planningForumName = (project: IProject) => `${project.code.toLowerCase()}${FORUM_NAME_SUFFIX}`;

export const isPlanningForum = (name: string) => name.endsWith(FORUM_NAME_SUFFIX);

const needsSync = (updated: Date, lastSynced?: Date) => !lastSynced || new Date(updated) > new Date(lastSynced);

/**
 * Makes sure a draft project's planning forum exists and gives it the right access, unless it was synced since the
 * project last changed. Returns the project as it now stands.
 */
export async function syncPlanningForum(project: IProject, forced = false): Promise<IProject> {
    const synced = project._metadata?.discord;
    if (!project.draft || (!forced && synced?.forumUrl && !needsSync(project.updated, synced.lastSynced))) {
        return project;
    }
    return (await ensureForum(project)).project;
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
            const synced = await syncPlanningForum(project, true);
            const slots = await dataService.slots.read({ project: project.number });
            for (const slot of slots.filter((slot) => !slot.closed && slot._metadata?.discord?.messageUrl)) {
                await openSlotDiscussion(synced, slot);
            }
        } catch (err) {
            logger.warn(new Error(`[Discord] Failed to sync planning forum for ${project.code}`, { cause: err }));
        }
    }
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

/**
 * Opens a thread for one slot, or hands back the one it has - making it again if it was deleted. Opened by hand it
 * names the person who did, and tells them of it; opened as a card arrived it names nobody.
 */
export async function openSlotDiscussion(
    project: IProject,
    slot: ISlot,
    startedBy?: string
): Promise<SlotDiscord | undefined> {
    const release = await discussionMutex.acquire();
    try {
        // Re-read rather than trusting the caller's copy: the slot it holds was loaded before the lock
        const [current] = await dataService.slots.read({ project: slot.project, number: slot.number });
        if (!current) {
            return undefined;
        }
        const existing = current._metadata?.discord;
        const guild = await discordService.getGuild();
        if (existing?.messageUrl && (await fetchThread(guild, existing.messageUrl))) {
            return existing;
        }

        const { forum } = await ensureForum(project);
        // A thread made again keeps saying who first opened it, without telling them of it a second time
        const openedBy = startedBy ?? existing?.startedBy;
        const thread = await forum.threads.create({
            name: threadName(current),
            reason: `Planning discussion for ${project.code} #${current.number}`,
            message: openingMessage(project, current, await discordService.getEmojiMap(), openedBy, !!startedBy),
            appliedTags: tagIds(forum, factionNames[current.faction]),
            autoArchiveDuration: forum.defaultAutoArchiveDuration
        });

        logger.info(`[Discord] Opened planning discussion for ${project.code} #${current.number}`);
        // A forum thread's opening message carries the thread's own id, so the one url stands for both
        const discord: SlotDiscord = {
            messageUrl: `https://discord.com/channels/${thread.guildId}/${thread.id}/${thread.id}`,
            ...(openedBy && { startedBy: openedBy }),
            lastSynced: new Date()
        };
        await dataService.slots.update(withDiscord(current, discord), true, false);
        return discord;
    } finally {
        release();
    }
}

/** Opens a slot's thread as its first card arrives - quietly, since nobody asked, and a failure only gets logged */
export async function autoOpenSlotDiscussion(projectNumber: number, slotNumber: number) {
    // Only a person adding a card opens one - not a sync, an import or a script
    const context = getContext();
    if (context.source !== "client") {
        return;
    }
    // Detached, so the change reaches the page of whoever added the card too - it has no response of its own to carry it
    await requestContext.run({ ...context, detached: true }, async () => {
        try {
            const [project] = await dataService.projects.read({ number: projectNumber });
            const [slot] = await dataService.slots.read({ project: projectNumber, number: slotNumber });
            if (!project?.draft || !slot || slot.closed || slot._metadata?.discord?.messageUrl) {
                return;
            }
            await openSlotDiscussion(project, slot);
        } catch (err) {
            logger.warn(
                new Error(`[Discord] Failed to open planning discussion for slot #${slotNumber}`, { cause: err })
            );
        }
    });
}

/** Puts a closed slot's thread away - shut and tagged, but kept, since the slot may come back */
export async function closeSlotDiscussion(project: IProject, slot: ISlot) {
    await withThread(project, slot, async (thread, forum) => {
        await thread.send(notice(CLOSED_COLOR, ":lock: Slot Closed", "This slot has been closed.", project));
        await thread.setAppliedTags(tagIds(forum, factionNames[slot.faction], CLOSED_TAG_NAME));
        await thread.setArchived(true);
    });
}

/** Opens a reopened slot's thread again */
export async function reopenSlotDiscussion(project: IProject, slot: ISlot) {
    await withThread(project, slot, async (thread, forum) => {
        await thread.setAppliedTags(tagIds(forum, factionNames[slot.faction]));
        await thread.send(notice(OPEN_COLOR, ":unlock: Slot Reopened", "This slot has been reopened.", project));
    });
}

/** Forgets the thread of a slot when it is deleted in Discord - it is made again on the next start, by hand or by a card */
export async function onPlanningForumMessageDeleted(messageUrl: string) {
    const affected = await dataService.slots.read({ "_metadata.discord.messageUrl": messageUrl } as never);
    if (affected.length === 0) {
        return;
    }

    logger.info(`[Discord] Planning discussion deleted: ${messageUrl}`);
    await dataService.slots.update(
        affected.map((slot) => {
            const metadata = omit(slot._metadata, "discord");
            return isEmpty(metadata) ? omit(slot, "_metadata") : { ...slot, _metadata: metadata };
        }),
        true,
        false
    );
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
        topic: `Planning for ${project.name}, a thread for each slot which has something to decide`,
        defaultAutoArchiveDuration: FORUM_ARCHIVE_MINUTES,
        availableTags: [...factions.map((faction) => ({ name: factionNames[faction] })), { name: CLOSED_TAG_NAME }],
        reason: `Planning forum for draft project ${project.code}`
    });
    logger.info(`[Discord] Created planning forum for ${project.code}`);
    return channel;
}

// Found or made, its access settled, and its url and the time recorded on the project
async function ensureForum(project: IProject) {
    const release = await forumMutex.acquire();
    try {
        // Re-read, as the project a caller holds may be a save behind the one which recorded the forum
        const [stored] = await dataService.projects.read({ number: project.number });
        const current = stored ?? project;
        const guild = await discordService.getGuild();
        const forum = (await findForum(guild, current)) ?? (await createForum(guild, current));
        await syncAccess(guild, forum, current);
        const synced = await dataService.projects.update(
            {
                ...current,
                _metadata: {
                    ...current._metadata,
                    discord: {
                        forumUrl: `https://discord.com/channels/${guild.id}/${forum.id}`,
                        lastSynced: new Date()
                    }
                }
            },
            true,
            false,
            false
        );
        return { forum, project: synced };
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

// Named by where it is, since a slot can be discussed before it holds a card to name it by
function threadName(slot: ISlot) {
    return `#${slot.number} ${factionNames[slot.faction]}`.slice(0, THREAD_NAME_MAX);
}

function projectButton(project: IProject) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel("Open Project")
            .setURL(`${process.env.CLIENT_HOST}/project/${project.number}`)
            .setStyle(ButtonStyle.Link)
    );
}

// What the slot asks of its card, and what has been noted about it - brief, as the slot itself is the place to read more
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

function openingMessage(
    project: IProject,
    slot: ISlot,
    emojis: Record<string, string>,
    openedBy: string | undefined,
    isNotified: boolean
) {
    const heading =
        `## ${project.emoji ? `:${project.emoji}: ` : ""}${project.code} #${slot.number} · ${factionNames[slot.faction]}` +
        "\nA place to talk over what this slot should hold.";
    const summary = slotSummary(slot, emojis);

    const container = new ContainerBuilder()
        .setAccentColor(OPEN_COLOR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(heading));
    if (summary) {
        container
            .addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(summary));
    }
    if (openedBy) {
        container
            .addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`Discussion manually opened by <@${openedBy}>`)
            );
    }
    container.addSeparatorComponents(new SeparatorBuilder()).addActionRowComponents(projectButton(project));

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 as const,
        allowedMentions: { users: openedBy && isNotified ? [openedBy] : [] }
    };
}

function notice(color: number, heading: string, body: string, project: IProject) {
    const container = new ContainerBuilder()
        .setAccentColor(color)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${heading}\n${body}`))
        .addActionRowComponents(projectButton(project));

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 as const,
        allowedMentions: { users: [] }
    };
}

// Runs something against a slot's thread, if it has one. Every caller is following a decision already saved, so a
// failure is logged and swallowed rather than refusing what it was recording
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
        // Archived threads take no edits until they are opened again
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
