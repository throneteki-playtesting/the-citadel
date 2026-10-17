import { ButtonInteraction } from "discord.js";
import { logger } from "@/services";
import { SUGGESTION_REACTION_PREFIX } from "../forums/suggestionForum";
import suggestionReaction from "./suggestionReaction";
import suggestionReactionConfirm from "./suggestionReactionConfirm";

export interface ButtonHandler {
    execute(interaction: ButtonInteraction): Promise<void>;
}

export const SUGGESTION_REACTION_CONFIRM_PREFIX = "suggestion-reaction-confirm";

/** Keyed by the customId prefix before its first ":" - eg. "suggestion-reaction:like" routes to
 *  the "suggestion-reaction" handler, which reads the remainder itself. */
export const buttonHandlers: Record<string, ButtonHandler> = {
    [SUGGESTION_REACTION_PREFIX]: suggestionReaction,
    [SUGGESTION_REACTION_CONFIRM_PREFIX]: suggestionReactionConfirm
};

// Shared by every button handler's catch block, so a failure always logs and answers once, never both
// silently swallowed and left hanging for the user.
export async function replyFallbackError(interaction: ButtonInteraction, logMessage: string, err: unknown) {
    logger.error(new Error(logMessage, { cause: err }));
    if (!interaction.deferred && !interaction.replied) {
        await interaction
            .reply({ flags: ["Ephemeral"], content: "Something went wrong. Please try again." })
            .catch(() => undefined);
    }
}
