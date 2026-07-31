import {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    InteractionContextType,
    PermissionFlagsBits,
    SlashCommandBuilder
} from "discord.js";
import { Command } from "../deployCommands";
import { dataService, logger } from "@/services";
import { AutoCompleteHelper, FollowUpHelper } from ".";
import { Code } from "common/models/cards";

const sync = {
    async data() {
        return new SlashCommandBuilder()
            .setName("sync")
            .setDescription("Sync chosen card or project")
            .addStringOption((option) =>
                option.setName("project").setDescription("Project for card").setRequired(false).setAutocomplete(true)
            )
            .addStringOption((option) =>
                option.setName("card").setDescription("Card to push").setRequired(false).setAutocomplete(true)
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM]);
    },
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: ["Ephemeral"] });
        try {
            const project = parseInt(interaction.options.getString("project")) || undefined;
            const code = (interaction.options.getString("card") as Code) || undefined;

            let cards = await dataService.cards.read([
                { project, code, latest: true },
                { project, code, draft: true }
            ]);
            cards = await dataService.cards.sync(cards);
            await FollowUpHelper.success(interaction, `Successfully synced ${cards.length} cards`);
        } catch (err) {
            logger.error(err);
            await FollowUpHelper.error(interaction, `Failed to sync cards: ${err.message}`);
        }
    },
    async autocomplete(interaction: AutocompleteInteraction) {
        AutoCompleteHelper.complete(interaction);
    }
} as Command;

export default sync;
