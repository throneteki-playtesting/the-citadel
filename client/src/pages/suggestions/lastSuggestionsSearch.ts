import { ScopeParams } from "../../hooks/useSearchParamsScope";

// Where the suggestions page was last left - which of its pages, and the browse page's filters, search and sort -
// so a link back to it from a suggestion returns to the list somebody was working through rather than a fresh one
const STORAGE_KEY = "citadel.suggestions.lastSearch";

export function rememberSuggestionsSearch(params: ScopeParams) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
            search.set(key, value);
        }
    }
    try {
        sessionStorage.setItem(STORAGE_KEY, search.toString());
    } catch {
        // Without storage the link back simply opens the page fresh
    }
}

export function lastSuggestionsPath() {
    let search: string | null = null;
    try {
        search = sessionStorage.getItem(STORAGE_KEY);
    } catch {
        // As above
    }
    return search ? `/suggestions?${search}` : "/suggestions";
}
