import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageFlags,
    SeparatorBuilder,
    TextDisplayBuilder
} from "discord.js";
import { Mutex } from "async-mutex";
import { merge } from "lodash-es";
import { IReleaseCheck, isCheckStale, ISlot } from "common/models/slots";
import { parseCardCode, SemanticVersion } from "common/utils";
import { dataService, discordService, logger } from "@/services";
import { extractFromURL } from "../utils";
import { getThreadFor } from "./cardForum";

const syncChecksMutex = new Mutex();

// Verdicts need to stand apart from the faction-coloured card embeds already in the thread
const OBJECTION_COLOR = 0xd4713a;
const READY_COLOR = 0x43b581;

/**
 * Mirrors every release check into its card's forum thread
 * @param slots Slots whose checks should be synced
 */
export async function syncReleaseChecks(slots: ISlot[]): Promise<ISlot[]> {
    // Outside the lock - a slot with nothing to say shouldn't queue behind a Discord round trip
    const targets = new Set(slots.filter((slot) => slot.statuses.design.checks.some((entry) => needsSync(entry))));
    if (targets.size === 0) {
        return slots;
    }

    const release = await syncChecksMutex.acquire();
    try {
        const results: ISlot[] = [];
        for (const slot of slots) {
            results.push(targets.has(slot) ? await syncSlotChecks(slot) : slot);
        }
        return results;
    } catch (err) {
        logger.warn(new Error("[Discord] Failed to sync release checks", { cause: err }));
        return slots;
    } finally {
        release();
    }
}

/** Removes the check messages belonging to slots which no longer exist */
export async function deleteReleaseChecks(slots: ISlot[]) {
    for (const slot of slots) {
        for (const entry of slot.statuses.design.checks.filter((check) => check._metadata?.discord?.messageUrl)) {
            try {
                const message = await fetchMessage(entry._metadata.discord.messageUrl);
                await message.delete();
            } catch (err) {
                logger.warn(
                    new Error(`[Discord] Failed to delete release check message for ${label(slot)}`, {
                        cause: err
                    })
                );
            }
        }
    }
    return slots;
}

/** Clears the stored message of a check deleted from Discord, so a later re-check can post afresh */
export async function onReleaseCheckMessageDeleted(messageUrl: string) {
    const affected = await dataService.slots.read({
        "statuses.design.checks._metadata.discord.messageUrl": messageUrl
    } as never);
    if (affected.length === 0) {
        return;
    }

    logger.info(`[Discord] Release check message deleted: ${messageUrl}`);
    for (const slot of affected) {
        for (const entry of slot.statuses.design.checks) {
            if (entry._metadata?.discord?.messageUrl === messageUrl) {
                delete entry._metadata.discord;
            }
        }
    }
    await dataService.slots.update(affected, true, false);
}

/**
 * Whether a check still owes Discord a message
 * @param latest Version of the slot's latest card; omitted for a cheap staleness-agnostic pre-filter
 */
function needsSync(entry: IReleaseCheck, latest?: SemanticVersion) {
    const posted = !!entry._metadata?.discord?.messageUrl;
    // A verdict on a version nobody is looking at any more is only worth syncing to amend what it already said
    if (!posted && isCheckStale(entry, latest)) {
        return false;
    }
    const lastSynced = entry._metadata?.discord?.lastSynced;
    return !lastSynced || entry.updated > lastSynced;
}

async function syncSlotChecks(slot: ISlot): Promise<ISlot> {
    const [latest] = await dataService.cards.read({ project: slot.project, number: slot.number, latest: true });
    if (!latest) {
        logger.warn(new Error(`[Discord] Slot ${label(slot)} has no card to check`));
        return slot;
    }

    const pending = slot.statuses.design.checks.filter((entry) => needsSync(entry, latest.version));
    if (pending.length === 0) {
        return slot;
    }

    let changed = false;
    for (const entry of pending) {
        try {
            await postOrEdit(slot, entry);
            changed = true;
        } catch (err) {
            logger.warn(
                new Error(`[Discord] Failed to sync release check for ${label(slot)} by ${entry.createdBy}`, {
                    cause: err
                })
            );
        }
    }

    if (!changed) {
        return slot;
    }
    return await persistMetadata(slot);
}

async function postOrEdit(slot: ISlot, entry: IReleaseCheck) {
    const existing = entry._metadata?.discord?.messageUrl;
    const thread = await threadFor(slot, entry);

    // Re-checking a new version moves the verdict to that version's thread, leaving what was said about
    // the old one where it was said
    if (existing && extractFromURL(existing).channelId === thread.id) {
        const target = await fetchMessage(existing);
        await target.edit(checkMessage(slot, entry, true));
        merge(entry, { _metadata: { discord: { lastSynced: new Date() } } });
        logger.verbose(`[Discord] Updated release check for ${label(slot)} by ${entry.createdBy}`);
        return;
    }

    logger.info(`[Discord] Posting release check for ${label(slot)} by ${entry.createdBy}`);
    const posted = await thread.send(checkMessage(slot, entry, false));
    merge(entry, { _metadata: { discord: { messageUrl: posted.url, lastSynced: new Date() } } });
}

// A check speaks to the version it was made against, so it belongs in that version's thread rather than
// whichever thread happens to be current - a newer version opens a thread the old verdict says nothing about
async function threadFor(slot: ISlot, entry: IReleaseCheck) {
    const [card] = await dataService.cards.read({
        project: slot.project,
        number: slot.number,
        version: entry.version
    });
    if (!card) {
        throw new Error(`Slot ${label(slot)} has no v${entry.version} card to attach a check to`);
    }
    const { thread } = await getThreadFor(card);
    return thread;
}

/**
 * Saves the message data gathered above against the stored slot. Slots are written whole, so anything
 * persisted while we were talking to Discord would be lost by saving our own copy over the top
 */
async function persistMetadata(slot: ISlot): Promise<ISlot> {
    const [current] = await dataService.slots.read({ project: slot.project, number: slot.number });
    if (!current) {
        return slot;
    }

    const synced = new Map(slot.statuses.design.checks.map((entry) => [entry.createdBy, entry._metadata]));
    for (const entry of current.statuses.design.checks) {
        const metadata = synced.get(entry.createdBy);
        if (metadata) {
            entry._metadata = metadata;
        }
    }

    // Sync off, or persisting the message url would immediately re-enter this function
    const [updated] = await dataService.slots.update([current], true, false, false);
    return updated;
}

async function fetchMessage(messageUrl: string) {
    const { channelId, messageId } = extractFromURL(messageUrl);
    const guild = await discordService.getGuild();
    const channel = await guild.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
        throw new Error(`Found channel is not text based with id: ${channelId}`);
    }
    return await channel.messages.fetch(messageId);
}

function label(slot: ISlot) {
    return parseCardCode(false, slot.project, slot.number);
}

// Stands alone in its own row - a section would force accompanying text next to it
function checkButton(slot: ISlot) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel("View Checks")
            .setURL(`${process.env.CLIENT_HOST}/project/${slot.project}/${slot.number}?releaseCheck=1`)
            .setStyle(ButtonStyle.Link)
    );
}

// Strikethrough doesn't span newlines, so each line is wrapped on its own
function strike(text: string, withdrawn: boolean) {
    if (!withdrawn) {
        return text;
    }
    return text
        .split("\n")
        .map((line) => (line.trim() ? `~~${line}~~` : line))
        .join("\n");
}

function reasoning(entry: IReleaseCheck, withdrawn: boolean) {
    const categories = (entry.categories ?? []).map((category) => `\`${category}\``).join(" ");
    const body = [categories, entry.note].filter(Boolean).join("\n");
    return strike(body, withdrawn);
}

/**
 * @param amending Whether this replaces the same version's earlier verdict, rather than opening a new one
 */
function checkMessage(slot: ISlot, entry: IReleaseCheck, amending: boolean) {
    // Reasoning only ever accompanies an objection, so a "ready" verdict carrying it once said no - but only
    // against the version it was raised on. Saying yes to a newer version is a verdict of its own, not a withdrawal
    const withdrawn = amending && entry.ready && !!reasoning(entry, false);
    if (entry.ready && !withdrawn) {
        return readyMessage(slot, entry);
    }
    return objectionMessage(slot, entry, withdrawn);
}

// Lean by design - a sign-off has no reasoning to read, so it stays a single glanceable line
function readyMessage(slot: ISlot, entry: IReleaseCheck) {
    const container = new ContainerBuilder()
        .setAccentColor(READY_COLOR)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### :thumbsup: Ready for Release\n<@${entry.createdBy}> has signed off on this card.`
            )
        )
        .addActionRowComponents(checkButton(slot));

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 as const,
        allowedMentions: { parse: [] as const }
    };
}

// A withdrawn objection keeps its original wording, so whatever it prompted stays readable
function objectionMessage(slot: ISlot, entry: IReleaseCheck, withdrawn: boolean) {
    const notice = withdrawn ? "*This check has been withdrawn - now a :thumbsup: to release.*\n" : "";
    // The heading marker stays outside the strikethrough, or Discord stops reading the line as a heading
    const heading = `### ${strike(":thumbsdown: Not Ready for Release", withdrawn)}`;
    const verdict = `<@${entry.createdBy}> ${strike("has not signed off on this card, with reasoning below.", withdrawn)}`;

    const container = new ContainerBuilder()
        .setAccentColor(withdrawn ? READY_COLOR : OBJECTION_COLOR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${notice}${heading}\n${verdict}`));

    const body = reasoning(entry, withdrawn);
    if (body) {
        container
            .addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
            .addSeparatorComponents(new SeparatorBuilder());
    }

    container.addActionRowComponents(checkButton(slot));

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 as const,
        allowedMentions: { parse: [] as const }
    };
}
