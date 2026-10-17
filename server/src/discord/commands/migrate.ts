import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    resolveColor,
    ContainerBuilder,
    InteractionContextType,
    MessageFlags,
    SlashCommandBuilder,
    TextDisplayBuilder
} from "discord.js";
import { Command } from "../deployCommands";
import { discordService, logger } from "@/services";
import { FollowUpHelper } from ".";
import { getContext } from "@/middleware/context";
import { hasPermission } from "common/utils";
import Permission from "common/models/permissions";
import { FORUM_NAME, isSuggestionForumThread } from "../forums/suggestionForum";
import { isThreadMigrated } from "../forums/legacySuggestionThreads";
import { colors } from "../utils";

const CITADEL_EMOJI = "citadel";

// Hands the thread's starter a link into the Citadel's migrate wizard, which does the actual work - this only
// answers the questions Discord can answer on the spot, so nobody is sent off to a wizard that will refuse them
const migrate = {
    async data() {
        return new SlashCommandBuilder()
            .setName("migrate")
            .setDescription("Moves this suggestion thread into the Citadel")
            .setContexts([InteractionContextType.Guild]);
    },
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: ["Ephemeral"] });
        try {
            const { principal } = getContext();
            if (!hasPermission(principal, Permission.MAKE_SUGGESTIONS)) {
                await FollowUpHelper.warning(interaction, "You aren't able to make suggestions.");
                return;
            }

            const thread = interaction.channel;
            if (!isSuggestionForumThread(thread)) {
                await FollowUpHelper.warning(
                    interaction,
                    `This only works inside a thread you started in the ${FORUM_NAME} channel.`
                );
                return;
            }
            // The Citadel's own threads already belong to a suggestion - only ones written by hand predate it
            if (thread.ownerId === interaction.client.user.id) {
                await FollowUpHelper.warning(
                    interaction,
                    "This thread already belongs to a Citadel suggestion - only threads started by hand, before the Citadel, can be migrated."
                );
                return;
            }
            if (thread.ownerId !== interaction.user.id) {
                await FollowUpHelper.warning(interaction, "Only the person who started this thread can migrate it.");
                return;
            }
            if (await isThreadMigrated(thread.url)) {
                await FollowUpHelper.information(interaction, "This thread has already been migrated to the Citadel.");
                return;
            }

            await interaction.followUp({
                flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
                allowedMentions: { parse: [] },
                components: [migratePrompt(thread.name, thread.id, await citadelEmoji())]
            });
        } catch (err) {
            logger.error(err);
            await FollowUpHelper.error(interaction, `Failed to start the migration: ${err.message}`);
        }
    }
} as Command;

// The server's own :citadel: emoji, synced like every other - the castle only stands in until that sync lands
async function citadelEmoji() {
    const emojis = await discordService.getEmojiMap();
    return emojis[CITADEL_EMOJI] ?? "🏰";
}

function migratePrompt(threadName: string, threadId: string, emoji: string) {
    const open = new ButtonBuilder()
        .setLabel("Continue")
        .setURL(`${process.env.CLIENT_HOST}/suggestions?migrate=${threadId}`)
        .setStyle(ButtonStyle.Link);

    return new ContainerBuilder()
        .setAccentColor(resolveColor(colors.citadel))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## ${emoji} Migrate this suggestion to the Citadel\n` +
                    `Fill in the rest of **${threadName}** on the Citadel. It keeps this thread's date and likes, ` +
                    "and once submitted gets a new thread - this one is then closed with a link to it."
            )
        )
        .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(open));
}

export default migrate;
