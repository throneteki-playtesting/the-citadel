import { ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { Command } from "../deployCommands";
import { dataService, logger } from "@/services";
import { FollowUpHelper } from ".";
import { plural } from "../utils";
import { getContext } from "@/middleware/context";
import { hasPermission } from "common/utils";
import { groupBy } from "lodash-es";
import Permission from "common/models/permissions";
import { isCheckStale } from "common/models/slots";

const checks = {
    async data() {
        return new SlashCommandBuilder()
            .setName("checks")
            .setDescription("Lists the cards still waiting on your release check")
            .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM]);
    },
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: ["Ephemeral"] });
        try {
            const { principal } = getContext();
            if (!hasPermission(principal, Permission.SUBMIT_RELEASE_CHECK)) {
                await FollowUpHelper.warning(interaction, "You aren't able to submit release checks.");
                return;
            }

            const outstanding = await findOutstanding(principal.id);
            if (outstanding.length === 0) {
                await FollowUpHelper.success(interaction, "You're all caught up - no cards are waiting on you.");
                return;
            }

            const releases = Object.values(groupBy(outstanding, "code"));
            const stale = outstanding.filter((item) => item.staleVersion).length;

            const summary =
                `You have **${outstanding.length}** ${plural(outstanding.length, "card")} awaiting your release` +
                ` check among **${releases.length}** ${plural(releases.length, "release")}.` +
                (stale > 0
                    ? `\n**${stale}** ${stale === 1 ? "card requires" : "cards require"} a re-check, as you` +
                      " answered for an older version."
                    : "");

            const groups = releases.map((cards) => {
                const lines = cards.map(
                    // Angle brackets keep Discord from unfurling a preview embed per card
                    (card) =>
                        `- [#${card.number} ${card.name}](<${card.url}>)` +
                        (card.staleVersion ? ` - re-check, you answered v${card.staleVersion}` : "")
                );
                return `### ${cards[0].releaseName} (${cards[0].code})\n${lines.join("\n")}`;
            });

            await FollowUpHelper.information(interaction, `${summary}\n\n${groups.join("\n")}`);
        } catch (err) {
            logger.error(err);
            await FollowUpHelper.error(interaction, `Failed to fetch your release checks: ${err.message}`);
        }
    }
} as Command;

// Cards in confirming releases which this person hasn't checked against the card's current version
async function findOutstanding(discordId: string) {
    const projects = await dataService.projects.read({ active: true });
    const outstanding: OutstandingCheck[] = [];

    for (const project of projects) {
        const confirming = project.releases.filter((release) => release.status === "confirming");
        if (confirming.length === 0) {
            continue;
        }

        const byCode = new Map(confirming.map((release) => [release.code, release]));
        const slots = (await dataService.slots.read({ project: project.number })).filter(
            (slot) => slot.release && byCode.has(slot.release.code)
        );

        for (const slot of slots) {
            const [latest] = await dataService.cards.read({
                project: project.number,
                number: slot.number,
                latest: true
            });
            if (!latest) {
                continue;
            }

            const mine = slot.statuses.design.checks.find((entry) => entry.createdBy === discordId);
            if (mine && !isCheckStale(mine, latest.version)) {
                continue;
            }

            const release = byCode.get(slot.release!.code)!;
            outstanding.push({
                number: slot.number,
                name: latest.name,
                code: release.code,
                releaseName: release.name,
                staleVersion: mine?.version,
                url: `${process.env.CLIENT_HOST}/project/${project.number}/${slot.number}?releaseCheck=1`
            });
        }
    }

    return outstanding;
}

type OutstandingCheck = {
    number: number;
    name: string;
    code: string;
    releaseName: string;
    /** Set when a check exists but answered an older version - the only case worth calling out */
    staleVersion?: string;
    url: string;
};

export default checks;
