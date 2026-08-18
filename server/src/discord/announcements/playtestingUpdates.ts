import {
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    Guild,
    MessageFlags,
    Role,
    SectionBuilder,
    SeparatorBuilder,
    TextChannel,
    TextDisplayBuilder
} from "discord.js";
import { Mutex } from "async-mutex";
import { merge, min } from "lodash-es";
import { IPlaytestingUpdate, IProject, PlaytestingUpdateState } from "common/models/projects";
import { IPlaytestCard, NoteType } from "common/models/cards";
import { PLAYTESTING_TEAM_ROLE_NAME } from "common/models/auth";
import { isAnnouncementStale, PLAYTESTING_TIT_URL, summarisePlaytestingUpdate } from "common/utils";
import { emojis, plural } from "../utils";
import { announceToOperations } from "./operations";
import { dataService, discordService, logger } from "@/services";
import { createSyncEmitter } from "@/services/sseService";

const PLAYTESTING_ANNOUNCEMENTS_CHANNEL_NAME = "playtesting-announcements";

const syncAnnouncementsMutex = new Mutex();

// Announces updates as they are confirmed, then keeps each post in step with how much has been implemented
export async function syncPlaytestingUpdateAnnouncements(
    forced?: boolean,
    only?: { project: number; version: number }
): Promise<IPlaytestingUpdate[]> {
    const release = await syncAnnouncementsMutex.acquire();
    const emitters = new Map<IPlaytestingUpdate, ReturnType<typeof createSyncEmitter<"playtestingUpdate">>>();
    try {
        const stale = await findStale(forced, only);
        if (stale.length === 0) {
            return [];
        }

        for (const { playtestingUpdate } of stale) {
            emitters.set(playtestingUpdate, createSyncEmitter("playtestingUpdate", "discord", playtestingUpdate));
        }
        emitters.forEach((emitter) => emitter.start());

        const context = await getAnnouncementContext();
        const synced: IPlaytestingUpdate[] = [];

        for (const { project, playtestingUpdate } of stale) {
            const emitter = emitters.get(playtestingUpdate);
            try {
                emitter.progress(playtestingUpdate._metadata?.discord?.messageUrl ? "Updating" : "Announcing");
                await postOrEdit(project, playtestingUpdate, context);
                merge(playtestingUpdate, { _metadata: { discord: { lastSynced: new Date() } } });
                synced.push(playtestingUpdate);
            } catch (err) {
                emitter.error("Failure");
                emitters.delete(playtestingUpdate);
                const label = `${project.code} v${playtestingUpdate.version}`;
                logger.warn(new Error(`[Discord] Failed to sync announcement for ${label}`, { cause: err }));
            }
        }

        if (synced.length === 0) {
            return [];
        }
        // Sync off, or persisting the message url would immediately re-enter this function
        const updated = await dataService.playtestingUpdates.update(synced, true, false, false);
        synced.forEach((playtestingUpdate, index) =>
            emitters.get(playtestingUpdate)?.complete(updated[index] ?? playtestingUpdate)
        );
        return updated;
    } catch (err) {
        emitters.forEach((emitter) => emitter.error("Failure"));
        logger.warn(new Error("[Discord] Failed to sync playtesting update announcements", { cause: err }));
        return [];
    } finally {
        release();
    }
}

// Only the newest update is worth a first post; older ones are kept in sync solely to correct what they claim
function isAnnounceable(playtestingUpdate: IPlaytestingUpdate, project?: IProject) {
    if (!project) {
        return false;
    }
    return !!playtestingUpdate._metadata?.discord?.messageUrl || playtestingUpdate.version === project.version;
}

// One read covers every candidate, so a settled update never costs a query of its own
async function getCardsChangedSince(candidates: IPlaytestingUpdate[]) {
    const oldest = min(candidates.map((candidate) => candidate._metadata?.discord?.lastSynced).filter(Boolean));
    if (!oldest) {
        return [];
    }
    return await dataService.cards.read({ updated: { $gt: oldest } });
}

async function findStale(forced?: boolean, only?: { project: number; version: number }) {
    const projects = await dataService.projects.read({ active: true });
    if (projects.length === 0) {
        return [];
    }
    const byNumber = new Map(projects.map((project) => [project.number, project]));

    const updates = await dataService.playtestingUpdates.read(
        only ? [only] : projects.map((project) => ({ project: project.number }))
    );
    const candidates = updates.filter((update) => isAnnounceable(update, byNumber.get(update.project)));
    if (candidates.length === 0) {
        return [];
    }

    const changed = await getCardsChangedSince(candidates);
    return candidates
        .filter((update) => forced || isAnnouncementStale(update, changed))
        .map((update) => ({ project: byNumber.get(update.project), playtestingUpdate: update }));
}

async function postOrEdit(project: IProject, playtestingUpdate: IPlaytestingUpdate, context: AnnouncementContext) {
    const cards = await dataService.cards.forUpdate(playtestingUpdate);
    const existing = playtestingUpdate._metadata?.discord?.messageUrl;
    const announcement = messages.announcement(project, playtestingUpdate, cards, context.taggedRole);

    if (existing) {
        const message = await fetchMessage(context, existing);
        // Edits never re-notify, but suppressing mentions keeps that true regardless of Discord's mood
        await message.edit({ ...announcement, allowedMentions: { parse: [] } });
        logger.verbose(`[Discord] Updated announcement for ${project.code} v${playtestingUpdate.version}`);
        return;
    }

    logger.info(`[Discord] Announcing ${project.code} playtesting update v${playtestingUpdate.version}`);
    const posted = await context.channel.send({ ...announcement, allowedMentions: { parse: ["roles"] } });
    merge(playtestingUpdate, { _metadata: { discord: { messageUrl: posted.url } } });

    await announceToOperations(project, playtestingUpdate, cards);
}

async function fetchMessage(context: AnnouncementContext, messageUrl: string) {
    const [, messageId] = messageUrl.match(/(\d+)$/) || [];
    return await context.channel.messages.fetch(messageId);
}

interface AnnouncementContext {
    guild: Guild;
    channel: TextChannel;
    taggedRole: Role;
}

async function getAnnouncementContext(): Promise<AnnouncementContext> {
    const guild = await discordService.getGuild();
    const errors: string[] = [];

    // Channel names carry a leading emoji, so they're matched on the readable portion only
    const channel = guild.channels.cache.find(
        (c) => c.isTextBased() && !c.isThread() && c.name.includes(PLAYTESTING_ANNOUNCEMENTS_CHANNEL_NAME)
    ) as TextChannel;
    if (!channel) {
        errors.push(`"${PLAYTESTING_ANNOUNCEMENTS_CHANNEL_NAME}" channel does not exist or is not a text channel`);
    }

    const taggedRole = await discordService.findRoleByName(guild, PLAYTESTING_TEAM_ROLE_NAME);
    if (!taggedRole) {
        errors.push(`"${PLAYTESTING_TEAM_ROLE_NAME}" role does not exist`);
    }

    if (errors.length > 0) {
        throw new Error(`Failed to build context: ${errors.join(", ")}`);
    }

    return { guild, channel, taggedRole };
}

export function updateUrl(playtestingUpdate: IPlaytestingUpdate) {
    return `${process.env.CLIENT_HOST}/project/${playtestingUpdate.project}/update/${playtestingUpdate.version}`;
}

const NOTE_ORDER: NoteType[] = ["updated", "reworked", "replaced", "wording"];

function changeSummary(notes: Partial<Record<NoteType, number>>) {
    return NOTE_ORDER.filter((type) => notes[type] > 0)
        .map((type) => `${emojis[type]} **${notes[type]}** ${type}`)
        .join("  ");
}

function factionSummary(factions: Partial<Record<string, number>>) {
    return Object.entries(factions)
        .map(([faction, count]) => `${emojis[faction]} **${count}**`)
        .join("  ");
}

// Deliberately points at the update page rather than listing cards, so the post never needs revisiting
function stateSummary(state: PlaytestingUpdateState, implemented: number, total: number) {
    switch (state) {
        case "playable":
            return (
                ":white_check_mark: **Playable now** - all cards available on" +
                ` [The Iron Throne](${PLAYTESTING_TIT_URL}).`
            );
        case "partial":
            return (
                `:hourglass_flowing_sand: **Partially playable** - **${implemented} of ${total}**` +
                " cards are implemented so far."
            );
        default:
            return (
                ":no_entry_sign: **Not yet playable online** - these changes need testing in person until" +
                " they are implemented."
            );
    }
}

const messages = {
    announcement(project: IProject, playtestingUpdate: IPlaytestingUpdate, cards: IPlaytestCard[], taggedRole: Role) {
        const { factions, notes, implemented, total, state } = summarisePlaytestingUpdate(cards);

        const container = new ContainerBuilder().addTextDisplayComponents(
            // Components V2 forbids message content, so the role mention lives in the body itself
            new TextDisplayBuilder().setContent(
                `## :${project.emoji}: ${project.name} - Playtesting Update #${playtestingUpdate.version}` +
                    `\n<@&${taggedRole.id}> **${total}** ${plural(total, "card change")} ${total === 1 ? "has" : "have"}` +
                    " been confirmed and are ready for playtesting." +
                    (playtestingUpdate.description ? `\n\n${playtestingUpdate.description}` : "")
            )
        );

        // Discord rejects empty text components, so a summary with nothing to say is left out entirely
        for (const summary of [changeSummary(notes), factionSummary(factions)].filter(Boolean)) {
            container
                .addSeparatorComponents(new SeparatorBuilder())
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(summary));
        }

        container
            .addSeparatorComponents(new SeparatorBuilder())
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(stateSummary(state, implemented, total))
                    )
                    .setButtonAccessory(
                        new ButtonBuilder()
                            .setLabel("View Update")
                            .setURL(updateUrl(playtestingUpdate))
                            .setStyle(ButtonStyle.Link)
                    )
            );

        return { components: [container], flags: MessageFlags.IsComponentsV2 as const };
    }
};
