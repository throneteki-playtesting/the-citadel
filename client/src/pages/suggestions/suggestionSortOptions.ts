export type SortOption = "name" | "faction" | "type" | "created" | "updated" | "likes";
export const sortOptions: Record<SortOption, string> = {
    name: "Name",
    faction: "Faction",
    type: "Card Type",
    created: "Created Date",
    updated: "Updated Date",
    likes: "Likes"
};
