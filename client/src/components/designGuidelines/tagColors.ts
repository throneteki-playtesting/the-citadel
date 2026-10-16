import { TagKind } from "common/designGuidelines/suggestionTags";
import { UIColor } from "../../types";

// The colour is how the three kinds read apart wherever a tag is listed or picked
const tagKindColors: Record<TagKind, UIColor> = {
    archetype: "secondary",
    aspect: "primary",
    drawback: "warning"
};

// Archetypes first
export const TAG_KIND_ORDER: Record<TagKind, number> = { archetype: 0, aspect: 1, drawback: 2 };

export function tagColor(kind: TagKind | undefined): UIColor {
    return kind ? tagKindColors[kind] : "default";
}
