import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    DiscordAPIError,
    MessageFlags,
    RESTJSONErrorCodes,
    SeparatorBuilder,
    TextDisplayBuilder
} from "discord.js";
import { Mutex } from "async-mutex";
import { merge } from "lodash-es";
import { IReleaseCheck, isCheckStale, ISlot } from "common/models/slots";
import { parseCardCode, SemanticVersion } from "common/utils";
import { dataService, discordService, logger } from "@/services";
import { extractFromURL } from "../utils";
import { toDiscord } from "common/richText/toDiscord";
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
    const targets = new Set(
        slots.filter((slot) => slot.statuses.design.checks.release.some((entry) => needsSync(entry)))
    );
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
        for (const entry of slot.statuses.design.checks.release.filter(
            (check) => check._metadata?.discord?.messageUrl
        )) {
            try {
                const message = await fetchMessage(entry._metadata.discord.messageUrl);
                await message?.delete();
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
        "statuses.design.checks.release._metadata.discord.messageUrl": messageUrl
    } as never);
    if (affected.length === 0) {
        return;
    }

    logger.info(`[Discord] Release check message deleted: ${messageUrl}`);
    for (const slot of affected) {
        for (const entry of slot.statuses.design.checks.release) {
            if (entry._metadata?.discord?.messageUrl === messageUrl) {
                delete entry._metadata.discord;
            }
        }
    }
    await dataService.slots.update(affected, true, false);
}

/**
 * Whether a check still owes Discord a message
 * @param latest Latest card version; omit for a cheap staleness-agnostic pre-filter
 */
function needsSync(entry: IReleaseCheck, latest?: SemanticVersion) {
    const posted = !!entry._metadata?.discord?.messageUrl;
    // Nothing left to say about a version nobody is looking at, short of amending what it already said
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

    const pending = slot.statuses.design.checks.release.filter((entry) => needsSync(entry, latest.version));
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

// A message is only kept for the version it was posted against, as re-checking a newer version clears it
async function postOrEdit(slot: ISlot, entry: IReleaseCheck) {
    const existing = entry._metadata?.discord?.messageUrl;
    if (existing) {
        const target = await fetchMessage(existing);
        // Anything deleted from Discord leaves nothing to amend, so it is posted afresh below
        if (target) {
            await target.edit(await checkMessage(slot, entry, true));
            merge(entry, { _metadata: { discord: { lastSynced: new Date() } } });
            logger.verbose(`[Discord] Updated release check for ${label(slot)} by ${entry.createdBy}`);
            return;
        }
    }

    logger.info(`[Discord] Posting release check for ${label(slot)} by ${entry.createdBy}`);
    const thread = await threadFor(slot, entry);
    const posted = await thread.send(await checkMessage(slot, entry, false));
    merge(entry, { _metadata: { discord: { messageUrl: posted.url, lastSynced: new Date() } } });
}

// A check belongs in the thread of the version it was made against, not whichever thread is current
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

/** Re-reads before writing, as slots are stored whole and ours is as old as the Discord round trip */
async function persistMetadata(slot: ISlot): Promise<ISlot> {
    const [current] = await dataService.slots.read({ project: slot.project, number: slot.number });
    if (!current) {
        return slot;
    }

    const synced = new Map(slot.statuses.design.checks.release.map((entry) => [entry.createdBy, entry._metadata]));
    for (const entry of current.statuses.design.checks.release) {
        const metadata = synced.get(entry.createdBy);
        if (metadata) {
            entry._metadata = metadata;
        }
    }

    // Sync off, or persisting the message url would immediately re-enter this function
    const [updated] = await dataService.slots.update([current], true, false, false);
    return updated;
}

/** Fetches a stored message, or undefined if it (or the thread holding it) has since been deleted */
async function fetchMessage(messageUrl: string) {
    const { channelId, messageId } = extractFromURL(messageUrl);
    const guild = await discordService.getGuild();
    try {
        const channel = await guild.channels.fetch(channelId);
        if (!channel) {
            return undefined;
        }
        if (!channel.isTextBased()) {
            throw new Error(`Found channel is not text based with id: ${channelId}`);
        }
        return await channel.messages.fetch(messageId);
    } catch (err) {
        const missing = [RESTJSONErrorCodes.UnknownChannel, RESTJSONErrorCodes.UnknownMessage];
        if (err instanceof DiscordAPIError && missing.some((code) => code === err.code)) {
            return undefined;
        }
        throw err;
    }
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

// The note has no editor behind it, so converting is about escaping: a typed `*` stays a `*`. Striking
// through comes afterwards and per line, as Discord will not carry `~~` across a newline
function reasoning(entry: IReleaseCheck, withdrawn: boolean, emojis: Record<string, string>) {
    const categories = (entry.categories ?? []).map((category) => `\`${category}\``).join(" ");
    const note = entry.note ? toDiscord(entry.note, { emojis }) : "";
    const body = [categories, note].filter(Boolean).join("\n");
    return strike(body, withdrawn);
}

/**
 * @param amending Whether this replaces the same version's earlier verdict rather than opening a new one
 */
async function checkMessage(slot: ISlot, entry: IReleaseCheck, amending: boolean) {
    const emojis = await discordService.getEmojiMap();
    // Reasoning only ever accompanies an objection, so amending one into a "ready" verdict withdraws it
    const withdrawn = amending && entry.ready && !!reasoning(entry, false, emojis);
    if (entry.ready && !withdrawn) {
        return readyMessage(slot, entry);
    }
    return objectionMessage(slot, entry, withdrawn, emojis);
}

// A sign-off has no reasoning to read, so it stays a single glanceable line
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
function objectionMessage(slot: ISlot, entry: IReleaseCheck, withdrawn: boolean, emojis: Record<string, string>) {
    const notice = withdrawn ? "*This check has been withdrawn - now a :thumbsup: to release.*\n" : "";
    // The heading marker stays outside the strikethrough, or Discord stops reading the line as a heading
    const heading = `### ${strike(":thumbsdown: Not Ready for Release", withdrawn)}`;
    const verdict = `<@${entry.createdBy}> ${strike("has not signed off on this card, with reasoning below.", withdrawn)}`;

    const container = new ContainerBuilder()
        .setAccentColor(withdrawn ? READY_COLOR : OBJECTION_COLOR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${notice}${heading}\n${verdict}`));

    const body = reasoning(entry, withdrawn, emojis);
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
