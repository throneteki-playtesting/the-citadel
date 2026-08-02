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
import { merge } from "lodash-es";
import { IProject, IProjectRelease } from "common/models/projects";
import { IReleaseCheckCard, IReleaseCheckParticipation } from "common/models/slots";
import { plural } from "../utils";
import { dataService, discordService, logger } from "@/services";
import { computeReleaseCheckCards, computeReleaseCheckParticipation } from "@/services/progressService";

const DESIGN_ANNOUNCEMENTS_CHANNEL_NAME = "release-reviews";
const DESIGN_TEAM_ROLE_NAME = "Design Team";

const syncReleaseChecksMutex = new Mutex();

/**
 * Posts (then keeps editing) the release check announcement for any release which is confirming,
 * and closes it off once the release moves on. Only the first post mentions the design team.
 * @param projects Projects whose releases should be synced
 * @param forced Sync even when the release looks up to date - used when a check changes
 */
export async function syncReleaseChecks(projects: IProject[], forced?: boolean): Promise<IProject[]> {
    const release = await syncReleaseChecksMutex.acquire();
    try {
        const targets = projects.filter((project) => project.releases.some((r) => needsSync(r, forced)));
        if (targets.length === 0) {
            return projects;
        }

        const context = await getAnnouncementContext();
        const results: IProject[] = [];
        for (const project of projects) {
            results.push(targets.includes(project) ? await syncProjectReleases(project, context, forced) : project);
        }
        return results;
    } catch (err) {
        logger.warn(new Error("[Discord] Failed to sync release checks", { cause: err }));
        return projects;
    } finally {
        release();
    }
}

let refreshInFlight: Promise<void> | undefined;

// Re-syncs open announcements after a permission change; bursty, so mid-pass callers join the same one
export async function refreshReleaseChecks(): Promise<void> {
    if (refreshInFlight) {
        return refreshInFlight;
    }

    refreshInFlight = (async () => {
        const projects = await dataService.projects.read({ active: true });
        await syncReleaseChecks(projects, true);
    })().finally(() => {
        refreshInFlight = undefined;
    });

    return refreshInFlight;
}

// A release is worth syncing while it's confirming, or once more after it stops (to close the message off)
function needsSync(release: IProjectRelease, forced?: boolean) {
    const isConfirming = release.status === "confirming";
    const announced = !!release._metadata?.discord?.messageUrl;
    if (!isConfirming && !announced) {
        return false;
    }
    if (forced) {
        return isConfirming;
    }
    const lastSynced = release._metadata?.discord?.lastSynced;
    return !lastSynced || release.updated > lastSynced;
}

async function syncProjectReleases(
    project: IProject,
    context: AnnouncementContext,
    forced?: boolean
): Promise<IProject> {
    let changed = false;

    for (const release of project.releases.filter((r) => needsSync(r, forced))) {
        try {
            if (release.status === "confirming") {
                const cards = await computeReleaseCheckCards(project.number, release.code);
                const participation = await computeReleaseCheckParticipation(cards);
                await postOrEdit(project, release, cards, participation, context);
            } else {
                await close(project, release, context);
            }
            merge(release, { _metadata: { discord: { lastSynced: new Date() } } });
            changed = true;
        } catch (err) {
            logger.warn(new Error(`[Discord] Failed to sync release checks for ${release.code}`, { cause: err }));
        }
    }

    if (!changed) {
        return project;
    }
    // Sync off, or persisting the message url would immediately re-enter this function
    const [updated] = await dataService.projects.update([project], true, false, false);
    return updated;
}

async function postOrEdit(
    project: IProject,
    release: IProjectRelease,
    cards: IReleaseCheckCard[],
    participation: IReleaseCheckParticipation,
    context: AnnouncementContext
) {
    const existing = release._metadata?.discord?.messageUrl;
    const announcement = messages.announcement(project, release, cards, participation, context.taggedRole);
    if (existing) {
        const message = await fetchMessage(context, existing);
        // Edits never re-notify, but suppressing mentions keeps that true regardless of Discord's mood
        await message.edit({ ...announcement, allowedMentions: { parse: [] } });
        logger.verbose(`[Discord] Updated release check announcement for ${release.code}`);
        return;
    }

    logger.info(`[Discord] Announcing release checks for ${release.code}`);
    const posted = await context.channel.send({ ...announcement, allowedMentions: { parse: ["roles"] } });
    merge(release, { _metadata: { discord: { messageUrl: posted.url } } });
}

async function close(project: IProject, release: IProjectRelease, context: AnnouncementContext) {
    const existing = release._metadata?.discord?.messageUrl;
    if (!existing) {
        return;
    }
    logger.info(`[Discord] Closing release check announcement for ${release.code}`);
    const message = await fetchMessage(context, existing);
    await message.edit(messages.closed(project, release));
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

// Fetches all Discord data once, and ensures the channel & role are valid before any writes begin
async function getAnnouncementContext(): Promise<AnnouncementContext> {
    const guild = await discordService.getGuild();
    const errors: string[] = [];

    // Channel names carry a leading emoji, so they're matched on the readable portion only
    const channel = guild.channels.cache.find(
        (c) => c.isTextBased() && !c.isThread() && c.name.includes(DESIGN_ANNOUNCEMENTS_CHANNEL_NAME)
    ) as TextChannel;
    if (!channel) {
        errors.push(`"${DESIGN_ANNOUNCEMENTS_CHANNEL_NAME}" channel does not exist or is not a text channel`);
    }

    const taggedRole = await discordService.findRoleByName(guild, DESIGN_TEAM_ROLE_NAME);
    if (!taggedRole) {
        errors.push(`"${DESIGN_TEAM_ROLE_NAME}" role does not exist`);
    }

    if (errors.length > 0) {
        throw new Error(`Failed to build context: ${errors.join(", ")}`);
    }

    return { guild, channel, taggedRole };
}

function releaseUrl(project: IProject, release: IProjectRelease) {
    return `${process.env.CLIENT_HOST}/project/${project.number}?release=${release.code}`;
}

function turnoutSummary(cards: IReleaseCheckCard[], participation: IReleaseCheckParticipation) {
    // Cards drop out of the list as their designs lock in, so the release can run out of them entirely
    if (cards.length === 0) {
        return ":white_check_mark: Every card's design is locked in - nothing left to check.";
    }

    const { eligible, started } = participation;
    // Both sides count only current permission holders, so this can't go negative
    const awaiting = eligible - started;
    const open = `**${cards.length}** ${plural(cards.length, "card")} still open for checks`;

    if (awaiting === 0) {
        return `:white_check_mark: All **${eligible}** members have checked in on the ${open}.`;
    }

    return (
        `:warning: **${awaiting} of ${eligible}** ${plural(eligible, "member")}` +
        ` ${awaiting === 1 ? "is" : "are"} yet to submit a single check, across the ${open}.`
    );
}

// Mentions render as profile chips whatever the nickname length, and never notify - pings stay suppressed
function completedSummary(completed: string[]) {
    if (completed.length === 0) {
        return undefined;
    }

    return ":white_check_mark: **Checked every card** - thanks!\n" + completed.map((id) => `<@${id}>`).join(", ");
}

const messages = {
    announcement(
        project: IProject,
        release: IProjectRelease,
        cards: IReleaseCheckCard[],
        participation: IReleaseCheckParticipation,
        taggedRole: Role
    ) {
        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                // Components V2 forbids message content, so the role mention lives in the body itself
                new TextDisplayBuilder().setContent(
                    `## ${release.code} - Release Checks Required` +
                        `\n<@&${taggedRole.id}> **${release.name}** has been marked as ${release.status}, and requires` +
                        " members to provide input on whether it's cards are ready to release as-is (excluding wording" +
                        " refinements)." +
                        "\n\nChecks close once a card's design is locked in, or the release is approved, so get" +
                        " yours in sooner rather than later."
                )
            )
            .addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(turnoutSummary(cards, participation)));

        // Only appears once somebody has earned it, so an untouched release doesn't carry an empty section
        const completed = completedSummary(participation.completed);
        if (completed) {
            container
                .addSeparatorComponents(new SeparatorBuilder())
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(completed));
        }

        container
            .addSeparatorComponents(new SeparatorBuilder())
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent("Use `/checks` to see which cards are waiting on you.")
                    )
                    .setButtonAccessory(
                        new ButtonBuilder()
                            .setLabel("View Release")
                            .setURL(releaseUrl(project, release))
                            .setStyle(ButtonStyle.Link)
                    )
            );

        return { components: [container], flags: MessageFlags.IsComponentsV2 as const };
    },
    closed(project: IProject, release: IProjectRelease) {
        const container = new ContainerBuilder().addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## ~~Release Checks Required for ${release.code}~~` +
                            `\n**${release.name}** is now ${release.status}, and its release checks are closed.`
                    )
                )
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setLabel("View Release")
                        .setURL(releaseUrl(project, release))
                        .setStyle(ButtonStyle.Link)
                )
        );

        return { components: [container], flags: MessageFlags.IsComponentsV2 as const };
    }
};
