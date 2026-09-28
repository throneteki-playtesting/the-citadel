import { compare } from "semver";
import { normaliseCardName, SemanticVersion } from "common/utils";
import { ICard, ICardSuggestion, IPlaytestCard, ISuggestionCardMatch } from "common/models/cards";
import { dataService } from "@/services";

// Which unclaimed project cards a legacy suggestion may already have become, matched on faction, type and any
// version's name. A draft project's slot holds each version as a separate candidate card.

interface CandidateCard {
    project: ISuggestionCardMatch["project"];
    number: number;
    version?: SemanticVersion;
    firstVersion: IPlaytestCard;
    names: Set<string>;
}

interface MatchIndex {
    matchesBySuggestion: Map<string, CandidateCard[]>;
    suggestionsByCard: Map<CandidateCard, number>;
}

// Reads every card and legacy suggestion, so is kept briefly rather than invalidated precisely
const CACHE_MS = 30_000;
let cache: { at: number; index: Promise<MatchIndex> } | undefined;

function cardKey(project: number, number: number, version?: SemanticVersion) {
    return version ? `${project}|${number}|${version}` : `${project}|${number}`;
}

function isMatch(card: CandidateCard, suggested: ICard) {
    return (
        card.firstVersion.faction === suggested.faction &&
        card.firstVersion.type === suggested.type &&
        card.names.has(normaliseCardName(suggested.name))
    );
}

async function buildIndex(): Promise<MatchIndex> {
    const [projects, cards, archived, legacy] = await Promise.all([
        dataService.projects.read(),
        dataService.cards.read(),
        dataService.suggestions.read({ archived: { $exists: true } }),
        dataService.suggestions.read({ legacy: true, draft: false, archived: { $exists: false } })
    ]);

    const projectsByNumber = new Map(projects.map((project) => [project.number, project]));
    const claimedByArchive = new Set(
        archived
            .filter((suggestion) => suggestion.archived?.project)
            .map((suggestion) => `${suggestion.archived!.project!.code}#${suggestion.archived!.project!.number}`)
    );

    const candidates = new Map<string, CandidateCard>();
    const claimed = new Set<string>();
    for (const card of cards) {
        const project = projectsByNumber.get(card.project);
        if (!project) {
            continue;
        }
        const version = project.draft ? card.version : undefined;
        const key = cardKey(card.project, card.number, version);
        if (card.suggestionId || claimedByArchive.has(`${project.code}#${card.number}`)) {
            claimed.add(key);
        }
        const existing = candidates.get(key);
        if (!existing) {
            candidates.set(key, {
                project: { number: project.number, code: project.code, isDraft: project.draft },
                number: card.number,
                version,
                firstVersion: card,
                names: new Set([normaliseCardName(card.name)])
            });
            continue;
        }
        existing.names.add(normaliseCardName(card.name));
        if (compare(card.version, existing.firstVersion.version) < 0) {
            existing.firstVersion = card;
        }
    }
    const available = [...candidates.entries()].filter(([key]) => !claimed.has(key)).map(([, card]) => card);

    const matchesBySuggestion = new Map<string, CandidateCard[]>();
    const suggestionsByCard = new Map<CandidateCard, number>();
    for (const suggestion of legacy) {
        const matches = available.filter((card) => isMatch(card, suggestion.card));
        if (matches.length === 0) {
            continue;
        }
        matchesBySuggestion.set(suggestion.id!, matches);
        for (const card of matches) {
            suggestionsByCard.set(card, (suggestionsByCard.get(card) ?? 0) + 1);
        }
    }
    return { matchesBySuggestion, suggestionsByCard };
}

function getIndex() {
    if (!cache || Date.now() - cache.at > CACHE_MS) {
        cache = { at: Date.now(), index: buildIndex() };
        // A failed build mustn't be served for the rest of the window
        cache.index.catch(() => {
            cache = undefined;
        });
    }
    return cache.index;
}

/** Forgets the current matches - after a suggestion is archived as a card, or a card is linked to one */
export function invalidateSuggestionCardMatches() {
    cache = undefined;
}

export async function getSuggestionCardMatches(suggestion: ICardSuggestion): Promise<ISuggestionCardMatch[]> {
    const { matchesBySuggestion, suggestionsByCard } = await getIndex();
    return (matchesBySuggestion.get(suggestion.id!) ?? []).map((card) => ({
        project: card.project,
        number: card.number,
        version: card.version,
        firstVersion: card.firstVersion,
        others: (suggestionsByCard.get(card) ?? 1) - 1
    }));
}

/** Every unarchived legacy suggestion with at least one card it may have become */
export async function getPossiblyDevelopedSuggestionIds(): Promise<string[]> {
    const { matchesBySuggestion } = await getIndex();
    return [...matchesBySuggestion.keys()];
}
