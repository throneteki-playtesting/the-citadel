import { dataService, discordService, logger } from "@/services";
import * as FormController from "gas/controllers/formController";
import GasClient from "@/google/gasClient";

export async function updateFormData(...projectNumbers: number[]) {
    const guild = await discordService.getGuild();
    const playtesterRole = await discordService.findRoleByName(guild, "Playtesting Team");
    if (!playtesterRole) {
        throw Error(`"Playtesting Team" role is missing from ${guild.name}`);
    }
    const reviewers = [...new Set(playtesterRole.members.map((member) => member.nickname || member.displayName).sort())];

    const projects = await dataService.projects.read(projectNumbers.map((number) => ({ number })));
    for (const project of projects) {
        const cards = await dataService.cards.read({ project: project.number, latest: true });
        const cardNames = cards.map((card) => `${card.number} - ${card.toString()}`);

        const client = new GasClient();
        const url = `${project.script}/form`;
        const body = JSON.stringify({ reviewers, cards: cardNames });
        const response = await client.post<FormController.SetValuesResponse>(url, null, body);
        logger.info(`Successfully updated ${project.name} form data with ${response.cards} cards and ${response.reviewers} reviewers`);
    }
}