import {
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    TextDisplayBuilder
} from "discord.js";
import { IPlaytestCard } from "common/models/cards";
import { IProject } from "common/models/projects";
import { checksClosedBy } from "common/models/slots";
import { isPreview } from "common/utils";
import { plural } from "../utils";
import { dataService, discordService, logger } from "@/services";

/**
 * DMs anyone whose release check was turned stale by a playtesting update, so they know to answer again.
 * Only cards sitting in a confirming release are worth chasing - checks elsewhere aren't being counted yet.
 * @param project Project the update belongs to
 * @param cards Cards which have just become the latest version
 */
export async function notifyStaleChecks(project: IProject, cards: IPlaytestCard[]) {
    try {
        const confirming = new Set(
            project.releases.filter((release) => release.status === "confirming").map((release) => release.code)
        );
        if (confirming.size === 0) {
            return;
        }

        const staled = new Map<string, StaledCheck[]>();

        for (const card of cards) {
            // Preview cards overwrite their own version, so nothing they replace was ever fresh
            if (isPreview(card)) {
                continue;
            }

            const [slot] = await dataService.slots.read({ project: project.number, number: card.number });
            if (!slot?.release || !confirming.has(slot.release.code)) {
                continue;
            }

            // Nothing to chase once the design is locked in - the check can no longer be answered again
            if (checksClosedBy(slot.statuses.design.status)) {
                continue;
            }

            // Only checks answering the version this update replaced have just gone stale - anything
            // older was already stale, and has been chased once before
            const previous = await dataService.cards.previous(card);
            if (!previous) {
                continue;
            }

            for (const entry of slot.statuses.design.checks.filter((check) => check.version === previous.version)) {
                const existing = staled.get(entry.createdBy) ?? [];
                existing.push({
                    number: card.number,
                    name: card.name,
                    code: slot.release.code,
                    from: previous.version,
                    to: card.version,
                    url: `${process.env.CLIENT_HOST}/project/${project.number}/${card.number}?releaseCheck=1`
                });
                staled.set(entry.createdBy, existing);
            }
        }

        for (const [discordId, checks] of staled) {
            const delivered = await discordService.sendDirectMessage(discordId, messages.staled(checks));
            if (!delivered) {
                logger.verbose(`[Discord] Could not DM stale release checks to ${discordId}`);
            }
        }
    } catch (err) {
        logger.warn(new Error("[Discord] Failed to notify stale release checks", { cause: err }));
    }
}

interface StaledCheck {
    number: number;
    name: string;
    code: string;
    from: string;
    to: string;
    url: string;
}

// A section per card gets its own button, so the list stays capped rather than growing unbounded
const CARD_SECTION_LIMIT = 6;

const messages = {
    staled(checks: StaledCheck[]) {
        const shown = checks.slice(0, CARD_SECTION_LIMIT);
        const hidden = checks.length - shown.length;
        const one = checks.length === 1;

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    "## Release Checks Gone Stale" +
                        `\n**${checks.length}** ${plural(checks.length, "card")} you checked ${one ? "has" : "have"} since` +
                        ` been updated, so your ${plural(checks.length, "check")} no longer ${one ? "counts" : "count"}` +
                        ` towards ${one ? "its" : "their"} release.`
                )
            )
            .addSeparatorComponents(new SeparatorBuilder());

        for (const check of shown) {
            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `**#${check.number} ${check.name}** - ${check.code}\n-# v${check.from} → v${check.to}`
                        )
                    )
                    .setButtonAccessory(
                        new ButtonBuilder().setLabel("Re-check").setURL(check.url).setStyle(ButtonStyle.Link)
                    )
            );
        }

        if (hidden > 0) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# +${hidden} more ${plural(hidden, "card")}`)
            );
        }

        container
            .addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent("Use `/checks` to see everything waiting on you.")
            );

        return { components: [container], flags: MessageFlags.IsComponentsV2 as const };
    }
};
