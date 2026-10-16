/** Union of tags carried by every reward/downside id a suggestion currently has selected - used both
 *  on a suggestion's own save and a settings bulk-resync. */
export function computeSuggestionTags(
    questions: { rewards?: string[]; downsides?: string[] },
    rewardOptions: { id: string; tags: string[] }[],
    downsideOptions: { id: string; tags: string[] }[]
): string[] {
    const selectedIds = new Set([...(questions.rewards ?? []), ...(questions.downsides ?? [])]);
    const tags = new Set<string>();
    for (const option of [...rewardOptions, ...downsideOptions]) {
        if (selectedIds.has(option.id)) {
            option.tags.forEach((tag) => tags.add(tag));
        }
    }
    return [...tags].sort();
}
