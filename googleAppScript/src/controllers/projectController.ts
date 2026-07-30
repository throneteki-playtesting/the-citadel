import { IProject } from "common/models/projects";
import * as RestClient from "../restClient";
import { getProjectDetails, setProjectDetails } from "../settings";

export function doGet(path: string[], e: GoogleAppsScript.Events.DoGet) {
    const project = getProjectDetails();
    const response = { request: e, data: { project } } as RestClient.Response<GetResponse>;
    return RestClient.generateResponse(response);
}

export function doPost(path: string[], e: GoogleAppsScript.Events.DoPost) {
    const project = JSON.parse(e.postData.contents) as IProject;
    setProjectDetails(project);
    const response = { request: e, data: { project } } as RestClient.Response<SetResponse>;
    return RestClient.generateResponse(response);
}

export interface GetResponse { project: IProject }
export interface SetResponse { project: IProject }