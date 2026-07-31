import {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    Guild,
    InteractionContextType,
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

        // Commands usable in a DM have to be registered globally - guild commands only ever appear
        // within their guild, no matter which contexts they declare
        const global = cmds.filter(isDirectMessageCapable);
        const guildOnly = cmds.filter((cmd) => !isDirectMessageCapable(cmd));

        await rest.put(Routes.applicationGuildCommands(clientId, guild.id), { body: guildOnly });
        await rest.put(Routes.applicationCommands(clientId), { body: global });

        logger.info(`Reloaded ${guildOnly.length} (/) commands for "${guild.name}", and ${global.length} globally`);
    } catch (err) {
        logger.error(err);
    }
}

function isDirectMessageCapable(cmd: SlashCommandOptionsOnlyBuilder) {
    return !!cmd.toJSON().contexts?.includes(InteractionContextType.BotDM);
}
