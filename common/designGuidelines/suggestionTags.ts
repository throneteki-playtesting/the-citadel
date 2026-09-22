/** Union of tags carried by every reward/punishment id a suggestion currently has selected - used both
 *  on a suggestion's own save and a settings bulk-resync. */
export function computeSuggestionTags(
    questions: { rewardTypes?: string[]; punishment?: string[] },
    rewardTypes: { id: string; tags: string[] }[],
    punishmentTypes: { id: string; tags: string[] }[]
): string[] {
    const selectedIds = new Set([...(questions.rewardTypes ?? []), ...(questions.punishment ?? [])]);
    const tags = new Set<string>();
    for (const option of [...rewardTypes, ...punishmentTypes]) {
        if (selectedIds.has(option.id)) {
            option.tags.forEach((tag) => tags.add(tag));
        }
    }
    return [...tags].sort();
}
