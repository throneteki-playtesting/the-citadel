import { EmbedBuilder, WebhookClient } from "discord.js";
import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { IPlaytestCard } from "common/models/cards";
import { PLAYTESTING_TEAM_ROLE_NAME } from "common/models/auth";
import { summarisePlaytestingUpdate } from "common/utils";
import { getRoleColor, plural } from "../utils";
import { logger } from "@/services";
import { updateUrl } from "./playtestingUpdates";

function releasesUrl(project: IProject) {
    return `${process.env.CLIENT_HOST}/project/${project.number}?tab=releases`;
}

// Fire and forget into a server the bot is not a member of; nothing is tracked and the post is never revisited
export async function announceToOperations(
    project: IProject,
    playtestingUpdate: IPlaytestingUpdate,
    cards: IPlaytestCard[]
) {
    const webhookUrl = process.env.DISCORD_OPERATIONS_WEBHOOK_URL;
    if (!webhookUrl) {
        logger.verbose("[Discord] No operations webhook configured - skipping recruitment post");
        return;
    }

    const webhook = new WebhookClient({ url: webhookUrl });
    try {
        const color = await getRoleColor(PLAYTESTING_TEAM_ROLE_NAME);
        await webhook.send({
            ...messages.recruitment(project, playtestingUpdate, cards, color),
            allowedMentions: { parse: ["everyone"] }
        });
        logger.info(`[Discord] Posted operations recruitment for ${project.code} v${playtestingUpdate.version}`);
    } catch (err) {
        logger.warn(new Error("[Discord] Failed to post operations recruitment", { cause: err }));
    } finally {
        webhook.destroy();
    }
}

const messages = {
    recruitment(project: IProject, playtestingUpdate: IPlaytestingUpdate, cards: IPlaytestCard[], color: number) {
        const { total } = summarisePlaytestingUpdate(cards);
        const clientUrl = process.env.CLIENT_HOST;

        const content = [
            `## :dart: ${project.emoji ? `:${project.emoji}: ` : ""}${project.name} - Playtesting Update #${playtestingUpdate.version}`,
            "@everyone",
            `The Design Team has released a new update for playtesting, pushing through **${total}** ${plural(total, "new card change")}.`,
            ":warning: *These changes may take some time to reach ThronesDB, or the playtesting instance of TheIronThrone.*\n",
            `### :scroll: [View Update](${updateUrl(playtestingUpdate)})`
        ].join("\n");

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(":crossed_swords: Want to help shape these cards?")
            .setDescription(
                "Playtesting is **open to everyone** - low experience & low commitment required." +
                    " Assemble a deck, play some games, and provide feedback that helps the design team release things quicker!" +
                    (clientUrl ? `\n\n**[Visit The Citadel to get started!](${clientUrl})**` : "")
            );

        const scheduleEmbed = new EmbedBuilder()
            .setTitle(":calendar_spiral: Curious what's coming next?")
            .setDescription(
                "Everyone's welcome to check out the current work-in-progress" +
                    ` **[release schedule](${releasesUrl(project)})**.`
            );

        return { content, embeds: [embed, scheduleEmbed] };
    }
};
