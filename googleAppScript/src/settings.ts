import { IProject, Type } from "common/models/projects";
import { openMultiWindow, safelyGetUI } from "./spreadsheets/userInput";

export enum GooglePropertiesType {
    Script,
    Document,
    User
}

function getPropertiesService(type: GooglePropertiesType) {
    switch (type) {
        case GooglePropertiesType.Script:
            return PropertiesService.getScriptProperties();
        case GooglePropertiesType.Document:
            return PropertiesService.getDocumentProperties();
        case GooglePropertiesType.User:
            return PropertiesService.getUserProperties();
    }
}

export function editProperties(type: GooglePropertiesType) {
    const service = getPropertiesService(type);
    let properties = service.getProperties();
    properties = openMultiWindow(properties, "Edit " + GooglePropertiesType[type] + " Properties");
    if (properties) {
        service.setProperties(properties);
    }
}

export function getProperties(type: GooglePropertiesType) {
    const service = getPropertiesService(type);
    return service.getProperties();
}

export function getProperty(type: GooglePropertiesType, key: string) {
    const service = getPropertiesService(type);
    let value = service.getProperty(key);
    const ui = safelyGetUI();
    if (!value && ui) {
        const response = ui.prompt("Please provide value for " + key + ":");
        value = response.getResponseText();
        service.setProperty(key, value);
    }
    return value;
}

export function setProperty(type: GooglePropertiesType, key: string, value: string | undefined) {
    const service = getPropertiesService(type);
    if (!value) {
        service.deleteProperty(key);
    } else {
        service.setProperty(key, value);
    }
}

export function deleteProperty(type: GooglePropertiesType, key: string) {
    const service = getPropertiesService(type);
    service.deleteProperty(key);
}

// Project Settings
export function getProjectDetails() {
    const version = getProperty(GooglePropertiesType.Script, "version");
    const emoji = getProperty(GooglePropertiesType.Script, "emoji");
    const perFaction = parseInt(getProperty(GooglePropertiesType.Script, "perFaction"));
    const project = {
        number: parseInt(getProperty(GooglePropertiesType.Script, "number")),
        name: getProperty(GooglePropertiesType.Script, "name"),
        code: getProperty(GooglePropertiesType.Script, "code"),
        active: getProperty(GooglePropertiesType.Script, "active") === "true",
        type: getProperty(GooglePropertiesType.Script, "type") as Type,
        script: getProperty(GooglePropertiesType.Script, "script"),
        cardCount: {
            baratheon: perFaction,
            greyjoy: perFaction,
            lannister: perFaction,
            martell: perFaction,
            thenightswatch: perFaction,
            stark: perFaction,
            targaryen: perFaction,
            tyrell: perFaction,
            neutral: parseInt(getProperty(GooglePropertiesType.Script, "neutral"))
        },
        version: version ? parseInt(version) : 0,
        milestone: parseInt(getProperty(GooglePropertiesType.Script, "milestone")),
        formUrl: getProperty(GooglePropertiesType.Script, "formUrl"),
        emoji: emoji || undefined
    } as IProject;
    return project;
}

export function setProjectDetails(project: IProject) {
    setProperty(GooglePropertiesType.Script, "number", `${project.number}`);
    setProperty(GooglePropertiesType.Script, "name", project.name);
    setProperty(GooglePropertiesType.Script, "code", `${project.code}`);
    setProperty(GooglePropertiesType.Script, "active", `${project.active}`);
    setProperty(GooglePropertiesType.Script, "type", project.type);
    setProperty(GooglePropertiesType.Script, "script", project.script);
    setProperty(GooglePropertiesType.Script, "perFaction", `${project.cardCount.baratheon}`);
    setProperty(GooglePropertiesType.Script, "neutral", `${project.cardCount.neutral}`);
    setProperty(GooglePropertiesType.Script, "version", `${project.version}`);
    setProperty(GooglePropertiesType.Script, "milestone", `${project.milestone}`);
    setProperty(GooglePropertiesType.Script, "formUrl", `${project.formUrl}`);
    if (project.emoji) {
        setProperty(GooglePropertiesType.Script, "emoji", `${project.emoji}`);
    }
}