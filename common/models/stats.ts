import { NoteType } from "./cards";

export type GlobalStats = {
    cardChanges: { total: number, byNoteType: Record<NoteType, number> };
    activeUsers: { total: number };
    cardsInTesting: { total: number, projectCount: number };
    reviews: { total: number, playtesterCount: number };
};

export type ProjectStats = {
    cardChanges: { total: number, factionCount: number };
    reviews: { total: number, reviewerCount: number };
    activeDecks: { total: number };
};
