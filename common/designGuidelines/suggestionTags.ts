interface TaggedOption {
    id: string;
    aspects: string[];
    archetypes: string[];
}

// An archetype is the deck a card suits, an aspect what a reward touches, a drawback what a downside costs
export type TagKind = "archetype" | "aspect" | "drawback";

export const tagKindLabels: Record<TagKind, string> = {
    archetype: "Archetype",
    aspect: "Aspect",
    drawback: "Drawback"
};

type TagSource = Pick<TaggedOption, "aspects" | "archetypes">;

function* kindedTags(rewardOptions: TagSource[], downsideOptions: TagSource[]): Generator<[string, TagKind]> {
    for (const [options, aspectKind] of [
        [rewardOptions, "aspect"],
        [downsideOptions, "drawback"]
    ] as const) {
        for (const option of options) {
            for (const tag of option.archetypes) {
                yield [tag, "archetype"];
            }
            for (const tag of option.aspects) {
                yield [tag, aspectKind];
            }
        }
    }
}

// A tag used as two kinds keeps its first
export function tagKinds(rewardOptions: TagSource[], downsideOptions: TagSource[]): Map<string, TagKind> {
    const kinds = new Map<string, TagKind>();
    for (const [tag, kind] of kindedTags(rewardOptions, downsideOptions)) {
        if (!kinds.has(tag)) {
            kinds.set(tag, kind);
        }
    }
    return kinds;
}

// Settings refuse a save with a clash, since a tag's colour is looked up from its kind
export function findTagKindClash(
    rewardOptions: TagSource[],
    downsideOptions: TagSource[]
): { tag: string; kinds: [TagKind, TagKind] } | undefined {
    const seen = new Map<string, TagKind>();
    for (const [tag, kind] of kindedTags(rewardOptions, downsideOptions)) {
        const previous = seen.get(tag);
        if (previous !== undefined && previous !== kind) {
            return { tag, kinds: [previous, kind] };
        }
        seen.set(tag, kind);
    }
    return undefined;
}

// Archetypes first
export function optionTags(option: TagSource): string[] {
    return [...option.archetypes, ...option.aspects];
}

function sameTagSet(a: string[], b: string[]): boolean {
    return a.length === b.length && b.every((tag) => a.includes(tag));
}

// Existing options whose tags changed - a new or removed option has no suggestions to resync
export function changedTagIds(current: TaggedOption[] | undefined, next: TaggedOption[]): string[] {
    if (!current) {
        return [];
    }
    const previousTagsById = new Map(current.map((option) => [option.id, optionTags(option)]));
    return next
        .filter((option) => {
            const previousTags = previousTagsById.get(option.id);
            return previousTags !== undefined && !sameTagSet(previousTags, optionTags(option));
        })
        .map((option) => option.id);
}

// Union of the tags of every reward and downside a suggestion has selected
export function computeSuggestionTags(
    questions: { rewards?: string[]; downsides?: string[] },
    rewardOptions: TaggedOption[],
    downsideOptions: TaggedOption[]
): string[] {
    const selectedIds = new Set([...(questions.rewards ?? []), ...(questions.downsides ?? [])]);
    const tags = new Set<string>();
    for (const option of [...rewardOptions, ...downsideOptions]) {
        if (selectedIds.has(option.id)) {
            optionTags(option).forEach((tag) => tags.add(tag));
        }
    }
    return [...tags].sort();
}
