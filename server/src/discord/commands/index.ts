import { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";
import { dataService, logger } from "@/services";
import sync from "./sync";
import { sortBy } from "lodash-es";
import { Code } from "common/models/cards";

export const commands = {
    sync
};

export class FollowUpHelper {
    static async information(interaction: ChatInputCommandInteraction, message: string) {
        await interaction.followUp({
            content: message,
            flags: ["Ephemeral"]
        }).catch(logger.error);
    }
    static async warning(interaction: ChatInputCommandInteraction, message: string) {
        await interaction.followUp({
            content: `:grey_exclamation: ${message}`,
            flags: ["Ephemeral"]
        }).catch(logger.error);
    }
    static async error(interaction: ChatInputCommandInteraction, message: string) {
        await interaction.followUp({
            content: `:exclamation: ${message}`,
            flags: ["Ephemeral"]
        }).catch(logger.error);
    }
    static async success(interaction: ChatInputCommandInteraction, message: string) {
        await interaction.followUp({
            content: `:white_check_mark: ${message}`,
            flags: ["Ephemeral"]
        }).catch(logger.error);
    }
}

export class AutoCompleteHelper {
    static async complete(interaction: AutocompleteInteraction) {
        const focusedOption = interaction.options.getFocused(true);
        const focusedValue = focusedOption.value.trim().toLowerCase();
        const project = interaction.options.getString("project") ? parseInt(interaction.options.getString("project")) : undefined;
        let choices = [];
        switch (focusedOption.name) {
            case "project": {
                const projects = await dataService.projects.read();
                choices = sortBy(projects, "number")
                    .filter((p) => p.active && p.name.toLowerCase().includes(focusedValue))
                    .map((p) => ({ name: p.name, value: p.number.toString() }));
                break;
            }
            case "card": {
                // Choices should be cards
                let cards = await dataService.cards.read({ project });
                // Manually filter out released cards (as their codes are different to dev version)
                const slots = cards.length > 0 ? await dataService.slots.read(cards.map((card) => ({ project: card.project, number: card.number }))) : [];
                const releasedSlots = new Set(slots.filter((slot) => slot.release).map((slot) => `${slot.project}|${slot.number}`));
                cards = cards.filter((card) => !releasedSlots.has(`${card.project}|${card.number}`));
                // Reverse to ensure the latest cards are added first
                choices = sortBy(cards, ["project", "number"])
                    .reduce((chs, card) => {
                        const name = `${card.code} - ${card.name}`;
                        const value = card.code;

                        // Only fetch if it matches the focused value, and wasn't already added (as a later version)
                        if (name.toLowerCase().includes(focusedValue.toLowerCase()) && !chs.some((c) => c.value === value)) {
                            chs.push({ name, value });
                        }
                        return chs;
                    }, [] as { name: string, value: string }[]);
                break;
            }
            case "version": {
                const code = interaction.options.getString("card") as Code;
                const cards = await dataService.cards.read({ project, code });
                choices = cards.map((card) => ({ name: card.version, value: card.version }));
                break;
            }
        }

        // Only get first 25 (limit by discord)
        const filtered = choices.slice(0, 25);
        await interaction.respond(filtered).catch(logger.error);
    }
}