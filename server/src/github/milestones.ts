import { dataService, githubService, logger } from "@/services";
import { IProject } from "common/models/projects";
import { keyedMutex } from "@/concurrency";

// Made once for a project, however many of its cards ask at the same time
const milestoneMutex = keyedMutex<IProject>(({ number }) => String(number));

export async function getMilestone(project: IProject) {
    if (project.milestone !== undefined) {
        return project.milestone;
    }
    const release = await milestoneMutex(project).acquire();
    try {
        const [stored] = await dataService.projects.read({ number: project.number });
        project = stored ?? project;
        if (project.milestone === undefined) {
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
        }
        return project.milestone!;
    } catch (err) {
        throw new Error(`Failed to create new milestone for ${project.code}.`, { cause: err });
    } finally {
        release();
    }
}
