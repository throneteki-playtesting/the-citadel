import {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    Guild,
    REST,
    Routes,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder
} from "discord.js";
import { commands } from "./commands";
import { logger } from "@/services";

export interface Command {
    data(): Promise<SlashCommandBuilder>;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
    autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

export async function buildCommands() {
    const successful: SlashCommandOptionsOnlyBuilder[] = [];

    await Promise.all(
        Object.entries(commands).map(([name, command]) =>
            command
                .data()
                .then((cmd) => successful.push(cmd))
                .catch((err) => logger.error(`Failed to build "${name}" command: ${err}`))
        )
    );
    return successful;
}

export async function deployCommands(
    cmds: SlashCommandOptionsOnlyBuilder[],
    { token, clientId, guild }: { token: string; clientId: string; guild: Guild }
) {
    try {
        const rest = new REST({ version: "10" }).setToken(token);
        await rest.put(Routes.applicationGuildCommands(clientId, guild.id), { body: cmds });

        logger.info(`Reloaded ${cmds.length} (/) commands for "${guild.name}"`);
    } catch (err) {
        logger.error(err);
    }
}
