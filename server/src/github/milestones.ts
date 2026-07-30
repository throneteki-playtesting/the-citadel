import { dataService, githubService, logger } from "@/services";
import { IProject } from "common/models/projects";

export async function getMilestone(project: IProject) {
    if (project.milestone === undefined) {
        try {
            const { client, owner, repo } = githubService.getContext();
            const title = `${project.number} | ${project.code} Development`;
            const existing = await client.paginate(client.rest.issues.listMilestones, {
                owner,
                repo,
                state: "all"
            });
            let milestone = existing.find((m) => m.title === title);
            if (milestone) {
                logger.info(
                    `[Github] Found existing milestone "${milestone.title}" (${milestone.number}) for project: ${milestone.html_url}`
                );
            } else {
                const { data } = await client.rest.issues.createMilestone({
                    owner,
                    repo,
                    title,
                    description: `Development related to the "${project.name}" playtesting project`
                });
                logger.info(
                    `[Github] Created new milestone "${data.title}" (${data.number}) for project: ${data.html_url}`
                );
                milestone = data;
            }
            project.milestone = milestone.number;
            // Update milestone back to database
            project = await dataService.projects.update(project, false);
        } catch (err) {
            throw new Error(`Failed to create new milestone for ${project.code}.`, { cause: err });
        }
    }
    return project.milestone!;
}
