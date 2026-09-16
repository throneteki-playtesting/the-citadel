import { ButtonInteraction } from "discord.js";
import { ButtonHandler, replyFallbackError } from ".";
import { dataService } from "@/services";

/** Answers the confirm/cancel row from suggestionReaction.ts's removal prompt. Acks immediately, before
 *  the unreact+sync runs, so a slow edit can never trip Discord's 3-second interaction window. */
const suggestionReactionConfirm: ButtonHandler = {
    async execute(interaction: ButtonInteraction) {
        const [, action, suggestionId] = interaction.customId.split(":");
        try {
            await interaction.deferUpdate();
            if (action === "remove") {
                await dataService.suggestions.unreact(suggestionId, interaction.user.id);
            }
            await interaction.deleteReply();
        } catch (err) {
            await replyFallbackError(interaction, "[Discord] Failed to remove suggestion reaction", err);
        }
    }
};

export default suggestionReactionConfirm;
