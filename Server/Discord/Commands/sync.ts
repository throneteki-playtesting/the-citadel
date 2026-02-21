import { AutocompleteInteraction, ChatInputCommandInteraction, GuildMember, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { Command } from "../DeployCommands";
import { dataService, GASAPI, githubService, logger, renderService } from "../../Services";
import { AutoCompleteHelper, FollowUpHelper } from ".";
import { FormController } from "@/GoogleAppScript/Controllers/FormController";
import CardThreads from "../CardThreads";
import Review from "@/Server/Data/Models/Review";
import ReviewThreads from "../ReviewThreads";
import { updateFormData } from "@/Server/Processing/Reviews";

const sync = {
    async data() {
        return new SlashCommandBuilder()
            .setName("sync")
            .setDescription("Sync specific data for a project")
            .addSubcommand(subcommand =>
                subcommand
                    .setName("cards")
                    .setDescription("Sync card data for a project")
                    .addStringOption(option =>
                        option.setName("project")
                            .setDescription("Project for card")
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
                    .addStringOption(option =>
                        option.setName("card")
                            .setDescription("Card to push")
                            .setRequired(false)
                            .setAutocomplete(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName("cardforum")
                    .setDescription("Sync discord card forum data for a project")
                    .addStringOption(option =>
                        option.setName("project")
                            .setDescription("Project for card")
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
                    .addStringOption(option =>
                        option.setName("card")
                            .setDescription("Card to push")
                            .setRequired(false)
                            .setAutocomplete(true)
                    )
                    .addBooleanOption(option =>
                        option.setName("create")
                            .setDescription("Whether sync should create new threads if it does not already exist")
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName("issues")
                    .setDescription("Sync Github issues with cards which require changes")
                    .addStringOption(option =>
                        option.setName("project")
                            .setDescription("Project for card")
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
                    .addStringOption(option =>
                        option.setName("card")
                            .setDescription("Card to push")
                            .setRequired(false)
                            .setAutocomplete(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName("pullrequests")
                    .setDescription("Sync Github pull requests with the latest card changes")
                    .addStringOption(option =>
                        option.setName("project")
                            .setDescription("Project for card")
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName("images")
                    .setDescription("Sync card images")
                    .addStringOption(option =>
                        option.setName("project")
                            .setDescription("Project for images")
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
                    .addStringOption(option =>
                        option.setName("card")
                            .setDescription("Card image to sync")
                            .setRequired(false)
                            .setAutocomplete(true)
                    )
                    .addBooleanOption(option =>
                        option.setName("override")
                            .setDescription("Whether to override existing images")
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName("pdfs")
                    .setDescription("Sync pdf print files")
                    .addStringOption(option =>
                        option.setName("project")
                            .setDescription("Project for pdf")
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
                    .addBooleanOption(option =>
                        option.setName("override")
                            .setDescription("Whether to override existing pdfs")
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName("form")
                    .setDescription("Sync users & cards on form")
                    .addStringOption(option =>
                        option.setName("project")
                            .setDescription("Project form to sync")
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName("reviews")
                    .setDescription("Sync reviews from form")
                    .addStringOption(option =>
                        option.setName("project")
                            .setDescription("Project to sync")
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
                    .addStringOption(option =>
                        option.setName("card")
                            .setDescription("Only sync reviews for this card")
                            .setRequired(false)
                            .setAutocomplete(true)
                    )
                    .addStringOption(option =>
                        option.setName("version")
                            .setDescription("Only sync reviews for this version of card")
                            .setRequired(false)
                            .setAutocomplete(true)
                    )
                    .addUserOption(option =>
                        option.setName("reviewer")
                            .setDescription("Only sync reviews from this user")
                            .setRequired(false)
                    )
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .setDMPermission(false);
    },
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });
        const subcommand = interaction.options.getSubcommand() as "cards" | "cardforum" | "issues" | "pullrequests" | "images" | "pdfs" | "form" | "reviews";
        try {
            switch (subcommand) {
                case "cards":
                    return await command.cards.execute(interaction);
                case "cardforum":
                    return await command.cardforum.execute(interaction);
                case "issues":
                    return await command.issues.execute(interaction);
                case "pullrequests":
                    return await command.pullRequests.execute(interaction);
                case "images":
                    return await command.images.execute(interaction);
                case "pdfs":
                    return await command.pdfs.execute(interaction);
                case "form":
                    return await command.form.execute(interaction);
                case "reviews":
                    return await command.reviews.execute(interaction);
                default:
                    throw Error(`Unknown Command "${subcommand}"`);
            }
        } catch (err) {
            logger.error(err);
            await FollowUpHelper.error(interaction, `Failed to sync ${subcommand}: ${err.message}`);
        }
    },
    async autocomplete(interaction: AutocompleteInteraction) {
        AutoCompleteHelper.complete(interaction);
    }
} as Command;

// TODO: Add a new FollowUpHelper to send incremental updates to user on what's currently happening (eg. Reading from spreadsheet...; Saving to database...)
const command = {
    cards: {
        async execute(interaction: ChatInputCommandInteraction) {
            const projectId = parseInt(interaction.options.getString("project"));
            const number = parseInt(interaction.options.getString("card")) || undefined;

            if (number === undefined) {
                await dataService.cards.database.destroy({ matchers: [{ projectId }] });
            }
            const cards = await dataService.cards.read({ matchers: [{ projectId, number }], hard: true });

            const content = `Successfully synced ${cards.length} card(s)`;

            await FollowUpHelper.success(interaction, content);
        }
    },
    cardforum: {
        async execute(interaction: ChatInputCommandInteraction) {
            const guild = interaction.guild;
            const projectId = parseInt(interaction.options.getString("project"));
            const number = parseInt(interaction.options.getString("card")) || undefined;
            const canCreate = interaction.options.getBoolean("create") || true;

            const cards = await dataService.cards.read({ matchers: [{ projectId, number }] });
            const { created, updated, failed } = await CardThreads.sync(guild, canCreate, ...cards);

            const results = [];
            if (created.length > 0) {
                results.push(`:asterisk: Created: ${created.map((card) => card._id).join(", ")}`);
            }
            if (updated.length > 0) {
                results.push(`:arrow_double_up: Updated: ${updated.map((card) => card._id).join(", ")}`);
            }
            if (failed.length > 0) {
                results.push(`:exclamation: Failed: ${failed.map((card) => card._id).join(", ")}`);
            }
            await FollowUpHelper.information(interaction, results.join("\n") || "No actions made");
        }
    },
    issues: {
        async execute(interaction: ChatInputCommandInteraction) {
            const projectId = parseInt(interaction.options.getString("project"));
            const number = parseInt(interaction.options.getString("card")) || undefined;

            const cards = await dataService.cards.read({ matchers: [{ projectId, number }] });
            const [project] = await dataService.projects.read({ codes: [projectId] });
            const issues = await githubService.syncIssues(project, cards);

            const content = issues.length === 1 ? `Successfully synced issue: [#${issues[0].number}](${issues[0].html_url})` : `${issues.length} open card issues synced.`;
            await FollowUpHelper.success(interaction, content);
        }
    },
    pullRequests: {
        async execute(interaction: ChatInputCommandInteraction) {
            const projectId = parseInt(interaction.options.getString("project"));

            const cards = await dataService.cards.read({ matchers: [{ projectId }] });
            const [project] = await dataService.projects.read({ codes: [projectId] });
            await renderService.syncPDFs(project, cards, true);
            try {
                const pullRequest = await githubService.syncPullRequest(project, cards);
                const content = `Successfully synced pull request: [#${pullRequest.number}](${pullRequest.html_url})`;
                await FollowUpHelper.success(interaction, content);
            } catch (err) {
                const content = `Failed to sync pull request: ${err.message}`;
                await FollowUpHelper.error(interaction, content);
            }
        }
    },
    images: {
        async execute(interaction: ChatInputCommandInteraction) {
            const projectId = parseInt(interaction.options.getString("project"));
            const number = parseInt(interaction.options.getString("card")) || undefined;
            const override = interaction.options.getBoolean("override") || true;

            const cards = await dataService.cards.read({ matchers: [{ projectId, number }] });

            await renderService.syncImages(cards, override);

            const content = `Successfully synced ${cards.length} card images`;
            await FollowUpHelper.success(interaction, content);
        }
    },
    pdfs: {
        async execute(interaction: ChatInputCommandInteraction) {
            const projectId = parseInt(interaction.options.getString("project"));
            const override = interaction.options.getBoolean("override") || true;

            const [project] = await dataService.projects.read({ codes: [projectId] });
            const cards = await dataService.cards.read({ matchers: [{ projectId }] });

            await renderService.syncPDFs(project, cards, override);

            const content = "Successfully synced pdfs";
            await FollowUpHelper.success(interaction, content);
        }
    },
    form: {
        async execute(interaction: ChatInputCommandInteraction) {
            const projectId = parseInt(interaction.options.getString("project"));

            await updateFormData(projectId);

            const content = `Successfully synced form for project ${projectId}`;
            await FollowUpHelper.success(interaction, content);
        }
    },
    reviews: {
        async execute(interaction: ChatInputCommandInteraction) {
            const guild = interaction.guild;
            const projectId = parseInt(interaction.options.getString("project"));
            const reviewer = interaction.options.getMember("reviewer") as GuildMember || undefined;
            const number = parseInt(interaction.options.getString("card")) || undefined;
            const version = interaction.options.getString("version") || undefined;

            const params = [
                // TODO: reviewer may need to be changed to be discord id or name string, as if a users nickname or displayname changes, it won't pick up their reviews anymore
                ...(reviewer ? [`reviewer=${reviewer.nickname || reviewer.displayName}`] : []),
                ...(number ? [`number=${number}`] : []),
                ...(version ? [`version=${version}`] : [])
            ];

            const [project] = await dataService.projects.read({ codes: [projectId] });
            // Get reviews from the form, not from the spreadsheet (as it contains all responses)
            const response = await GASAPI.get<FormController.GASReadFormReviews>(`${project.script}/form${params.length > 0 ? `?${params.join("&")}` : ""}`);

            // Sort reviews by date (latest first), then distinct the list (keeping first reviews, thus the "latest")
            // This ensures that only the latest version of that review (by _id) is being saved
            const reviews = await Review.fromModels(...response.reviews);
            const distinct = reviews.sort((r1, r2) => r2.date.getTime() - r1.date.getTime()).filter((r, i, a) => a.findIndex((rv) => rv._id === r._id) === i);

            await dataService.reviews.update({ reviews: distinct, upsert: true });

            const { created, updated, failed } = await ReviewThreads.sync(guild, true, ...distinct);

            const results = [];
            if (created.length > 0) {
                results.push(`:asterisk: Created: ${created.map((card) => card._id).join(", ")}`);
            }
            if (updated.length > 0) {
                results.push(`:arrow_double_up: Updated: ${updated.map((card) => card._id).join(", ")}`);
            }
            if (failed.length > 0) {
                results.push(`:exclamation: Failed: ${failed.map((card) => card._id).join(", ")}`);
            }
            await FollowUpHelper.information(interaction, results.join("\n") || "No actions made");
        }
    }
};

export default sync;