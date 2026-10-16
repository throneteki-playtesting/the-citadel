// Flips the guide from "unseen" to "dismissed" once someone says so, never resurfacing on this browser again.
export const SUGGESTION_EDITOR_GUIDE_DISMISSED_KEY = "suggestion-editor-guide-dismissed";

export function isSuggestionEditorGuideDismissed(): boolean {
    try {
        return localStorage.getItem(SUGGESTION_EDITOR_GUIDE_DISMISSED_KEY) === "true";
    } catch {
        // Private browsing / storage disabled - fail open (show the guide) rather than throw.
        return false;
    }
}
