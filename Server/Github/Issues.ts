import Card from "../Data/Models/Card";
import fs from "fs";
import ejs from "ejs";
import { emojis, githubify } from "./Utils";
import path from "path";
import { fileURLToPath } from "url";
import Project from "../Data/Models/Project";
import { apiUrl } from "@/Server";
import { Cards } from "@/Common/Models/Cards";

export type GeneratedIssue = {
    title: string,
    body: string,
    labels: string[],
    milestone: number
};
export type GeneratedPullRequest = {
    title: string,
    body: string,
    labels: string[],
    milestone: number
};

type NotePackage = { icons: string, title: string, text: string };

export class Issue {
    static forCard(project: Project, card: Card) {
        const milestone = project.milestone;
        const type = card.note?.type || (card.isInitial && card.implementStatus !== "Implemented" ? "Implemented" : null);
        if (!type) {
            return null;
        }
        const slimCard = {
            name: card.name,
            version: card.version,
            imageUrl: card.imageUrl,
            note: card.note?.text
        };
        const previousSlimCard = () => {
            if (!card.playtesting) {
                throw Error("Playtesting version is missing or invalid");
            }
            const version = card.playtesting;
            const imageUrl = card.previousImageUrl;
            return { version, imageUrl };
        };
        let title = `${card.code} | ${project.short} - `;

        switch (type) {
            case "Replaced": {
                title += `Replace with ${card.toString()}`;
                const replaced = slimCard;
                const previous = previousSlimCard();
                const body = Issue.renderTemplate({ type, replaced, previous, project });
                const labels = ["automated", "implement-card", "update-card"];
                return { title, body, labels, milestone } as GeneratedIssue;
            }
            case "Reworked": {
                title += `Rework as ${card.toString()}`;
                const reworked = slimCard;
                const previous = previousSlimCard();
                const body = Issue.renderTemplate({ type, reworked, previous, project });
                const labels = ["automated", "update-card"];
                return { title, body, labels, milestone } as GeneratedIssue;
            }
            case "Updated": {
                title += `Update to ${card.toString()}`;
                const updated = slimCard;
                const previous = previousSlimCard();
                const body = Issue.renderTemplate({ type, updated, previous, project });
                const labels = ["automated", "update-card"];
                return { title, body, labels, milestone } as GeneratedIssue;
            }
            case "Implemented": {
                title += `Implement ${card.toString()}`;
                const implemented = slimCard;
                const body = Issue.renderTemplate({ type, implemented, project });
                const labels = ["automated", "implement-card"];
                return { title, body, labels, milestone } as GeneratedIssue;
            }
            default: throw Error(`"${type}" is not a valid note type`);
        }
    }
    static forUpdate(project: Project, cards: Card[]) {
        if (cards.length === 0) {
            return null;
        }
        const milestone = project.milestone;
        const noteTypeOrdered = ["Replaced", "Reworked", "Updated", "Implemented"] as Cards.NoteType[];
        const notesUsed = new Set<Cards.NoteType>();
        const notesMap = cards.reduce((map, card) => {
            const noteType = card.note?.type ?? (card.implementStatus === "Recently Implemented" ? "Implemented" : undefined);
            // Only collate cards which have notes on them
            if (noteType && noteTypeOrdered.includes(noteType)) {
                const allNoteTypes = [noteType];
                // Some cards can be updated, and can also be implemented in the same update
                if (noteType !== "Implemented" && card.implementStatus === "Recently Implemented") {
                    allNoteTypes.unshift("Implemented");
                }
                const title = `${card.code} | ${card.name} v${card.version}`;
                const text = card.note?.text || null;
                const icons = allNoteTypes.map((ant) => emojis[ant]).join("");
                const current = map.get(noteType) || [];
                current.push({ icons, title, text });
                map.set(noteType, current);

                // Add all icons to "notesUsed" set for legend
                allNoteTypes.forEach((nt) => notesUsed.add(nt));
            }
            return map;
        }, new Map<Cards.NoteType, NotePackage[]>());

        const notesLegend = noteTypeOrdered.filter((nt) => notesUsed.has(nt)).map((nt) => `${nt} = ${emojis[nt]}`).join(", ");
        const notes = noteTypeOrdered.map((nt) => notesMap.get(nt)).flat().filter((n) => n);
        const number = project.releases + 1;
        const pdf = {
            all: encodeURI(`${apiUrl}/pdf/${project.code}/${number}_all.pdf`),
            updated: cards.some((card) => card.isChanged) ? encodeURI(`${apiUrl}/pdf/${project.code}/${number}_updated.pdf`) : undefined
        };
        const date = new Date().toDateString();
        const body = Issue.renderTemplate({ type: "Playtesting Update", emojis, number, project, pdf, notesLegend, notes, date });

        const title = `${project.short} | Playtesting Update ${number}`;
        const labels = ["automated", "playtest-update"];

        return { title, body, labels, milestone } as GeneratedPullRequest;
    }

    private static renderTemplate(data: ejs.Data) {
        const { type, ...restData } = data;
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const filePath = `${__dirname}/Templates/${type}.ejs`;
        const file = fs.readFileSync(filePath).toString();

        const jsonRepoData = {
            name: "throneteki-json-data",
            url: "https://github.com/throneteki-playtesting/throneteki-json-data"
        };
        const date = new Date().toDateString();
        const render = ejs.render(file, { filename: filePath, jsonRepoData, date, emojis, ...restData });

        return githubify(render);
    }
}