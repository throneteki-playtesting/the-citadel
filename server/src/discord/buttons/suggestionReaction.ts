import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle } from "discord.js";
import { ButtonHandler, replyFallbackError, SUGGESTION_REACTION_CONFIRM_PREFIX } from ".";
import { dataService } from "@/services";
import { getContext } from "@/middleware/context";
import { hasPermission } from "common/utils";
import Permission from "common/models/permissions";
import { suggestionReactionBlockReason } from "common/models/cards";
import { buildContainer, suggestionImageFilename } from "../forums/suggestionForum";

/** The ephemeral "are you sure" row shown before a reaction is actually removed - carries the
 *  suggestion id, since this click lands on the ephemeral reply, not the suggestion's own message. */
function confirmRow(suggestionId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`${SUGGESTION_REACTION_CONFIRM_PREFIX}:remove:${suggestionId}`)
            .setStyle(ButtonStyle.Danger)
            .setLabel("Remove Reaction"),
        new ButtonBuilder()
            .setCustomId(`${SUGGESTION_REACTION_CONFIRM_PREFIX}:cancel:${suggestionId}`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Cancel")
    );
}

/** Answers with `update()` rather than `deferUpdate()` + a later edit, so the count changes and the
 *  spinner clears in one round trip instead of flashing the old count first. */
const suggestionReaction: ButtonHandler = {
    async execute(interaction: ButtonInteraction) {
        const reactType = interaction.customId.split(":")[1] as "like" | "dislike";
        try {
            const [suggestion] = await dataService.suggestions.read({
                _metadata: { discord: { messageUrl: interaction.message.url } }
            });
            if (!suggestion) {
                await interaction.reply({ flags: ["Ephemeral"], content: "This suggestion could not be found." });
                return;
            }

            const { principal } = getContext();
            if (!hasPermission(principal, Permission.READ_SUGGESTIONS)) {
                await interaction.reply({
                    flags: ["Ephemeral"],
                    content: "You don't have permission to react to suggestions."
                });
                return;
            }

            const blockReason = suggestionReactionBlockReason(suggestion, interaction.user.id);
            if (blockReason) {
                await interaction.reply({ flags: ["Ephemeral"], content: blockReason });
                return;
            }

            const current = suggestion._metadata?.engagement?.reactions?.[interaction.user.id]?.type;
            if (current === reactType) {
                // Removing is the one destructive direction here, so it gets a confirmation first.
                await interaction.reply({
                    flags: ["Ephemeral"],
                    content: `You've already ${current === "like" ? "liked" : "disliked"} this suggestion. Remove your reaction?`,
                    components: [confirmRow(suggestion.id!)]
                });
                return;
            }

            const updated = await dataService.suggestions.react(suggestion.id!, interaction.user.id, reactType, false);
            if (!updated) {
                await interaction.reply({ flags: ["Ephemeral"], content: "This suggestion could not be found." });
                return;
            }

            const container = await buildContainer(updated, suggestionImageFilename(updated));
            await interaction.update({ components: [container] });
        } catch (err) {
            await replyFallbackError(interaction, "[Discord] Failed to handle suggestion reaction button", err);
        }
    }
};

export default suggestionReaction;
