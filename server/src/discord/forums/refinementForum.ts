import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    DiscordAPIError,
    ForumChannel,
    Guild,
    GuildForumTag,
    MessageFlags,
    RESTJSONErrorCodes,
    Role,
    SeparatorBuilder,
    TextDisplayBuilder,
    ThreadChannel
} from "discord.js";
import { Mutex } from "async-mutex";
import { IPlaytestCard } from "common/models/cards";
import { IProject } from "common/models/projects";
import { ISlot } from "common/models/slots";
import { InquirySeverity, inquirySeverityLabels, IRefinementInquiry } from "common/models/refinement";
import { getFinalCardNumber, parseCardCode } from "common/utils";
import { toDiscord } from "common/richText/toDiscord";
import { truncateHtml } from "common/richText/truncate";
import { dataService, discordService, logger } from "@/services";
import { extractFromURL } from "../utils";

const FORUM_NAME = "refinement-forum";
const REFINEMENT_ROLE_NAME = "Release Refinement Team";
/** Discord's own cap on a thread's name */
const THREAD_NAME_MAX = 100;
const DETAIL_MAX = 1200;

// Opening a discussion is the one operation two people can race - the button is on a page both of them
// are looking at, and the loser of that race would open a second thread for the same inquiry
const discussionMutex = new Mutex();

const SEVERITY_COLORS: Record<InquirySeverity, number> = {
    unchecked: 0x8a8a8a,
    needsConfirmation: 0x7a5cc4,
    recommendation: 0x3a7ad4,
    minorProblem: 0xd4913a,
    majorProblem: 0xd44a3a
};
const RESOLVED_COLOR = 0x43b581;
const DELETED_COLOR = 0x6a6a6a;

/**
 * Opens a thread for one inquiry, or hands back the one it already has - a second press, or a second
 * person pressing at the same moment, must find the first thread rather than open its twin.
 */
export async function startInquiryDiscussion(
    project: IProject,
    slot: ISlot,
    inquiry: IRefinementInquiry,
    card: IPlaytestCard,
    startedBy: string
): Promise<InquiryDiscord> {
    const release = await discussionMutex.acquire();
    try {
        // Re-read rather than trusting the caller's copy: the slot it holds was loaded before the lock
        const existing = await storedDiscord(slot, inquiry.inquiry);
        if (existing?.threadUrl) {
            return existing;
        }

        const context = await getRefinementForumContext();
        const thread = await context.channel.threads.create({
            name: threadName(slot, inquiry, card),
            reason: `Refinement discussion for ${label(slot, inquiry)}`,
            message: openingMessage(
                project,
                slot,
                inquiry,
                card,
                startedBy,
                context,
                await discordService.getEmojiMap()
            ),
            appliedTags: tagsFor(context, project, inquiry).map((tag) => tag.id),
            autoArchiveDuration: context.channel.defaultAutoArchiveDuration
        });

        logger.info(`[Discord] Opened refinement discussion for ${label(slot, inquiry)}`);
        // A thread's starter message carries the thread's own id in both positions, which is what makes
        // one url serve as both the thread and the message the delete handler matches on
        const url = `https://discord.com/channels/${thread.guildId}/${thread.id}/${thread.id}`;
        return { threadUrl: url, messageUrl: url, startedBy, lastSynced: new Date() };
    } finally {
        release();
    }
}

/**
 * Settles an inquiry's thread: says so, tags it, and archives it. Never deletes - what was discussed is
 * the record of how the inquiry was answered.
 */
export async function closeInquiryDiscussion(project: IProject, slot: ISlot, inquiry: IRefinementInquiry) {
    await withThread(slot, inquiry, async (thread, context) => {
        await thread.send(
            notice(
                RESOLVED_COLOR,
                ":white_check_mark: Inquiry Resolved",
                `<@${inquiry.resolution?.by}> has marked this inquiry as resolved.` +
                    (inquiry.addressedIn ? `\nAddressed in **${inquiry.addressedIn}**.` : ""),
                slot
            )
        );
        await thread.setAppliedTags(tagsFor(context, project, inquiry, true).map((tag) => tag.id));
        await thread.setArchived(true);
        logger.info(`[Discord] Archived resolved refinement discussion for ${label(slot, inquiry)}`);
    });
}

/** Puts a settled thread back into the conversation, since reopening is undoing rather than re-raising */
export async function reopenInquiryDiscussion(project: IProject, slot: ISlot, inquiry: IRefinementInquiry) {
    await withThread(slot, inquiry, async (thread, context) => {
        await thread.setAppliedTags(tagsFor(context, project, inquiry).map((tag) => tag.id));
        await thread.send(
            notice(
                SEVERITY_COLORS[inquiry.severity],
                ":arrows_counterclockwise: Inquiry Reopened",
                "This inquiry has been reopened, and stands against the card again.",
                slot
            )
        );
        logger.info(`[Discord] Reopened refinement discussion for ${label(slot, inquiry)}`);
    });
}

/**
 * Says outright that the inquiry is gone, then locks and archives. Locked as well as archived, since an
 * archived thread reopens itself the moment somebody posts and there is nothing left here to discuss.
 */
export async function endInquiryDiscussion(slot: ISlot, inquiry: IRefinementInquiry) {
    await withThread(slot, inquiry, async (thread) => {
        await thread.send(
            notice(
                DELETED_COLOR,
                ":wastebasket: Inquiry Deleted",
                "This inquiry has been deleted, and no longer stands against the card. " +
                    "Anything still worth asking should be raised afresh.",
                slot
            )
        );
        await thread.setLocked(true);
        await thread.setArchived(true);
        logger.info(`[Discord] Closed deleted refinement discussion for ${label(slot, inquiry)}`);
    });
}

/** Clears the stored thread of an inquiry whose thread was deleted from Discord, so it can be opened again */
export async function onRefinementForumMessageDeleted(messageUrl: string) {
    const affected = await dataService.slots.read({
        "statuses.design.inquiries._metadata.discord.threadUrl": messageUrl
    } as never);
    if (affected.length === 0) {
        return;
    }

    logger.info(`[Discord] Refinement discussion deleted: ${messageUrl}`);
    for (const slot of affected) {
        for (const entry of slot.statuses.design.inquiries) {
            if (entry._metadata?.discord?.threadUrl === messageUrl) {
                delete entry._metadata.discord;
            }
        }
    }
    await dataService.slots.update(affected, true, false);
}

export type InquiryDiscord = NonNullable<NonNullable<IRefinementInquiry["_metadata"]>["discord"]>;

interface RefinementForumContext {
    guild: Guild;
    channel: ForumChannel;
    /** Who a new thread is put in front of - the same pattern the card forum uses for the Design Team */
    refinementRole: Role;
    projectTags: Record<number, GuildForumTag>;
    severityTags: Record<string, GuildForumTag>;
    resolvedTag: GuildForumTag;
}

// Read once per operation and checked in full, so a forum missing a tag fails before anything is posted
// rather than halfway through - same shape as the card forum's own context
async function getRefinementForumContext(): Promise<RefinementForumContext> {
    const guild = await discordService.getGuild();
    const errors: string[] = [];

    const channel = guild.channels.cache.find(
        (c) => c instanceof ForumChannel && c.name.endsWith(FORUM_NAME)
    ) as ForumChannel;
    if (!channel) {
        errors.push(`"${FORUM_NAME}" channel does not exist or is not a forum`);
    }

    const refinementRole = await discordService.findRoleByName(guild, REFINEMENT_ROLE_NAME);
    if (!refinementRole) {
        errors.push(`"${REFINEMENT_ROLE_NAME}" role does not exist`);
    }

    const projects = await dataService.projects.read({ active: true });
    const projectTags: Record<number, GuildForumTag> = {};
    for (const project of projects) {
        const tag = channel?.availableTags.find((t) => t.name === project.code);
        if (!tag) {
            errors.push(`"${project.code}" tag is missing on forum "${FORUM_NAME}"`);
        } else {
            projectTags[project.number] = tag;
        }
    }

    const severityTags: Record<string, GuildForumTag> = {};
    for (const [severity, name] of Object.entries(inquirySeverityLabels)) {
        const tag = channel?.availableTags.find((t) => t.name === name);
        if (!tag) {
            errors.push(`"${name}" tag is missing on forum "${FORUM_NAME}"`);
        } else {
            severityTags[severity] = tag;
        }
    }

    const resolvedTag = channel?.availableTags.find((t) => t.name === "Resolved");
    if (!resolvedTag) {
        errors.push(`"Resolved" tag is missing on forum "${FORUM_NAME}"`);
    }

    if (errors.length > 0) {
        throw new Error(`Failed to build context: ${errors.join(", ")}`);
    }

    return { guild, channel, refinementRole, projectTags, severityTags, resolvedTag };
}

/**
 * Runs something against an inquiry's thread, if it has one. Every caller is following a decision already
 * saved, so a failure is logged and swallowed rather than refusing what it was recording.
 */
async function withThread(
    slot: ISlot,
    inquiry: IRefinementInquiry,
    action: (thread: ThreadChannel, context: RefinementForumContext) => Promise<void>
) {
    const threadUrl = inquiry._metadata?.discord?.threadUrl;
    if (!threadUrl) {
        return;
    }

    try {
        const thread = await fetchThread(threadUrl);
        if (!thread) {
            return;
        }
        // Archived threads take no edits until they are opened again, and every action here ends by
        // deciding whether it should be archived anyway
        if (thread.archived) {
            await thread.setArchived(false);
        }
        await action(thread, await getRefinementForumContext());
    } catch (err) {
        logger.warn(new Error(`[Discord] Failed to update discussion for ${label(slot, inquiry)}`, { cause: err }));
    }
}

/** The thread behind a stored url, or undefined where it has since been deleted */
async function fetchThread(threadUrl: string) {
    const { messageId: threadId } = extractFromURL(threadUrl);
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

/** What the record says right now, rather than what the caller was holding when it asked */
async function storedDiscord(slot: ISlot, inquiry: number) {
    const [current] = await dataService.slots.read({ project: slot.project, number: slot.number });
    return current?.statuses.design.inquiries.find((entry) => entry.inquiry === inquiry)?._metadata?.discord;
}

// The card the inquiry is about leads, since the forum lists threads from many cards at once. Cut to fit
// rather than left for Discord to refuse: a long card name is not a reason to lose the thread
function threadName(slot: ISlot, inquiry: IRefinementInquiry, card: IPlaytestCard) {
    const name = `${slot.number}. ${card.name} - ${inquiry.summary}`;
    return name.length > THREAD_NAME_MAX ? `${name.slice(0, THREAD_NAME_MAX - 1)}…` : name;
}

function label(slot: ISlot, inquiry: IRefinementInquiry) {
    return `${parseCardCode(false, slot.project, slot.number)} inquiry #${inquiry.inquiry}`;
}

// A resolved thread answers to its outcome rather than its severity, which is how the list reads at a
// glance - the severity tag stays, since what was raised is still what was raised
function tagsFor(context: RefinementForumContext, project: IProject, inquiry: IRefinementInquiry, resolved = false) {
    const tags = [context.projectTags[project.number], context.severityTags[inquiry.severity]].filter(Boolean);
    if (resolved) {
        tags.push(context.resolvedTag);
    }
    return tags;
}

function inquiryButton(slot: ISlot) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel("View Inquiry")
            .setURL(`${process.env.CLIENT_HOST}/project/${slot.project}/${slot.number}?tab=refinement`)
            .setStyle(ButtonStyle.Link)
    );
}

// Read the way a card is named: where it lives, what it is called, its version, then the release number
// only some cards have. Severity trails the lot, since it classifies the inquiry rather than the card
function cardLine(project: IProject, slot: ISlot, inquiry: IRefinementInquiry, card: IPlaytestCard) {
    const finalNumber = getFinalCardNumber(project, slot);
    const parts = [
        `${project.emoji ? `:${project.emoji}: ` : ""}${project.code} #${slot.number}`,
        `**${card.name}**`,
        inquiry.version,
        ...(slot.release && finalNumber !== undefined ? [`${slot.release.code} #${finalNumber}`] : []),
        `**${inquirySeverityLabels[inquiry.severity]}**`
    ];
    return parts.join(" · ");
}

// One person doing both is the usual case, and saying their name twice to record it reads as two people
function attribution(inquiry: IRefinementInquiry, startedBy: string) {
    if (inquiry.createdBy === startedBy) {
        return `Raised & discussion opened by <@${startedBy}>`;
    }
    return `Raised by <@${inquiry.createdBy}>\nDiscussion opened by <@${startedBy}>`;
}

function openingMessage(
    project: IProject,
    slot: ISlot,
    inquiry: IRefinementInquiry,
    card: IPlaytestCard,
    startedBy: string,
    context: RefinementForumContext,
    emojis: Record<string, string>
) {
    const heading =
        `## ${inquiry.summary}` +
        `\n${cardLine(project, slot, inquiry, card)}` +
        `\n\n<@&${context.refinementRole.id}>` +
        `\n${attribution(inquiry, startedBy)}`;

    const container = new ContainerBuilder()
        .setAccentColor(SEVERITY_COLORS[inquiry.severity])
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(heading));

    if (inquiry.detail) {
        // Measured as Discord will read it, so the markers the conversion adds are paid for by the cut
        const detail = toDiscord(
            truncateHtml(inquiry.detail, DETAIL_MAX, (html) => toDiscord(html, { emojis }).length),
            { emojis }
        );
        container
            .addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(detail))
            .addSeparatorComponents(new SeparatorBuilder());
    }

    container.addActionRowComponents(inquiryButton(slot));

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 as const,
        // The role is the point of the post - it is what puts a new question in front of the people who
        // answer them. The two people named are already involved, so neither is pinged
        allowedMentions: { parse: ["roles"] as const }
    };
}

function notice(color: number, heading: string, body: string, slot: ISlot) {
    const container = new ContainerBuilder()
        .setAccentColor(color)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${heading}\n${body}`))
        .addActionRowComponents(inquiryButton(slot));

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 as const,
        allowedMentions: { parse: [] as const }
    };
}
