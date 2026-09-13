export interface IconicOptionDefinition {
    value: boolean;
    label: string;
    description: string;
    examples: string[];
}

// The two sides of the "Iconic Reference" question - a plain boolean, since the STR calc (see
// computeStrength.ts) treats every flavor of "iconic" identically.
export const ICONIC_OPTIONS: IconicOptionDefinition[] = [
    {
        value: true,
        label: "Iconic",
        description: "Leans on a recognizable reference from the source material.",
        examples: ["Tyrion Lannister", "Valyrian Steel Blade"]
    },
    {
        value: false,
        label: "Not Iconic",
        description: "An original or generic design, no specific reference.",
        examples: ["Confiscation", "Citadel Archivist"]
    }
];
