import { dataService, githubService, logger } from "@/services";
import { IProject } from "common/models/projects";

export async function getMilestone(project: IProject) {
    if (project.milestone === undefined) {
        try {
            const { client, owner, repo } = githubService.getContext();
            const { data } = await client.rest.issues.createMilestone({
                owner,
                repo,
                title: `${project.number} | ${project.code} Development`,
                description: `Development related to the "${project.name}" playtesting project`
            });
            logger.info(`[Github] Created new milestone "${data.title}" (${data.number}) for project: ${data.html_url}`);
            project.milestone = data.number;
            // Update milestone back to database
            project = await dataService.projects.update(project, false);
        } catch (err) {
            throw new Error(`Failed to create new milestone for ${project.code}.`, { cause: err });
        }
    }
    return project.milestone!;
}