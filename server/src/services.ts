import "@/config";

import DataService from "@/data";
import DiscordService from "@/discord";
import GithubService from "@/github";
import LoggerService from "@/logger";
import ThronesDbCardPoolService from "@/services/thronesDbCardPoolService";

export const logger = LoggerService.initialise();

export const dataService = new DataService();
export const thronesDbCardPoolService = new ThronesDbCardPoolService();
export const discordService = new DiscordService();
export const githubService = new GithubService();
