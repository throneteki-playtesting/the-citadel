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
import { IPlaytestCard } from "common/models/cards";
import { IReleaseCheck, ISlot } from "common/models/slots";
import { parseCardCode } from "common/utils";
import { dataService, discordService, logger } from "@/services";
import { extractFromURL } from "../utils";
import { getThreadFor } from "./cardForum";

const syncObjectionsMutex = new Mutex();

// Objections need to stand apart from the faction-coloured card embeds already in the thread
const OBJECTION_COLOR = 0xd4713a;
const WITHDRAWN_COLOR = 0x4f545c;

/**
 * Mirrors every "not ready" release check into its card's forum thread
 * @param slots Slots whose checks should be synced
 */
export async function syncReleaseCheckObjections(slots: ISlot[]): Promise<ISlot[]> {
    // Outside the lock - a slot with nothing to say shouldn't queue behind a Discord round trip
    const targets = new Set(slots.filter((slot) => slot.statuses.design.checks.some(needsSync)));
    if (targets.size === 0) {
        return slots;
    }

    const release = await syncObjectionsMutex.acquire();
    try {
        const results: ISlot[] = [];
        for (const slot of slots) {
            results.push(targets.has(slot) ? await syncSlotObjections(slot) : slot);
        }
        return results;
    } catch (err) {
        logger.warn(new Error("[Discord] Failed to sync release check objections", { cause: err }));
        return slots;
    } finally {
        release();
    }
}

/** Removes the objections belonging to slots which no longer exist */
export async function deleteReleaseCheckObjections(slots: ISlot[]) {
    for (const slot of slots) {
        for (const entry of slot.statuses.design.checks.filter((check) => check._metadata?.discord?.messageUrl)) {
            try {
                const message = await fetchMessage(entry._metadata.discord.messageUrl);
                await message.delete();
            } catch (err) {
                logger.warn(
                    new Error(`[Discord] Failed to delete release check objection for ${label(slot)}`, {
                        cause: err
                    })
                );
            }
        }
    }
    return slots;
}

/** Clears the stored message of an objection deleted from Discord, so a later re-check can post afresh */
export async function onReleaseCheckObjectionDeleted(messageUrl: string) {
    const affected = await dataService.slots.read({
        "statuses.design.checks._metadata.discord.messageUrl": messageUrl
    } as never);
    if (affected.length === 0) {
        return;
    }

    logger.info(`[Discord] Release check objection deleted: ${messageUrl}`);
    for (const slot of affected) {
        for (const entry of slot.statuses.design.checks) {
            if (entry._metadata?.discord?.messageUrl === messageUrl) {
                delete entry._metadata.discord;
            }
        }
    }
    await dataService.slots.update(affected, true, false);
}

function needsSync(entry: IReleaseCheck) {
    const posted = !!entry._metadata?.discord?.messageUrl;
    // A "ready" verdict only matters here when it withdraws an objection already in the thread
    if (entry.ready && !posted) {
        return false;
    }
    const lastSynced = entry._metadata?.discord?.lastSynced;
    return !lastSynced || entry.updated > lastSynced;
}

async function syncSlotObjections(slot: ISlot): Promise<ISlot> {
    const pending = slot.statuses.design.checks.filter(needsSync);
    if (pending.length === 0) {
        return slot;
    }

    // Read up front - every pending entry shares the same card, and so the same thread
    const [card] = await dataService.cards.read({ project: slot.project, number: slot.number, latest: true });
    if (!card) {
        logger.warn(new Error(`[Discord] Slot ${label(slot)} has no card to object to`));
        return slot;
    }

    let changed = false;
    for (const entry of pending) {
        try {
            await postOrEdit(slot, card, entry);
            changed = true;
        } catch (err) {
            logger.warn(
                new Error(`[Discord] Failed to sync release check objection for ${label(slot)} by ${entry.createdBy}`, {
                    cause: err
                })
            );
        }
    }

    if (!changed) {
        return slot;
    }
    // Sync off, or persisting the message url would immediately re-enter this function
    const [updated] = await dataService.slots.update([slot], true, false, false);
    return updated;
}

async function postOrEdit(slot: ISlot, card: IPlaytestCard, entry: IReleaseCheck) {
    const existing = entry._metadata?.discord?.messageUrl;
    const message = objectionMessage(slot, entry);
    const { thread } = await getThreadFor(card);

    // A new card version opens a new thread, leaving anything posted to the old one behind
    if (existing && extractFromURL(existing).channelId === thread.id) {
        const target = await fetchMessage(existing);
        await target.edit(message);
        merge(entry, { _metadata: { discord: { lastSynced: new Date() } } });
        logger.verbose(`[Discord] Updated release check objection for ${label(slot)} by ${entry.createdBy}`);
        return;
    }

    logger.info(`[Discord] Posting release check objection for ${label(slot)} by ${entry.createdBy}`);
    const posted = await thread.send(message);
    merge(entry, { _metadata: { discord: { messageUrl: posted.url, lastSynced: new Date() } } });
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

// A withdrawn objection keeps its original wording, so whatever it prompted stays readable
function objectionMessage(slot: ISlot, entry: IReleaseCheck) {
    const withdrawn = entry.ready;

    const notice = withdrawn ? "*This check has since been withdrawn.*\n" : "";
    // The heading marker stays outside the strikethrough, or Discord stops reading the line as a heading
    const heading = `### ${strike(":thumbsdown: Not Ready for Release", withdrawn)}`;
    const verdict = `<@${entry.createdBy}> ${strike("has provided their reasoning below.", withdrawn)}`;

    const container = new ContainerBuilder()
        .setAccentColor(withdrawn ? WITHDRAWN_COLOR : OBJECTION_COLOR)
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
