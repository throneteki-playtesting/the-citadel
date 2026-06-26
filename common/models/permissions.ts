import { SingleOrArray } from "common/types";

enum Permission {
    /** Can create new projects */
    CREATE_PROJECTS = "CREATE_PROJECTS",
    /** Can edit existing projects */
    EDIT_PROJECTS = "EDIT_PROJECTS",
    /** Can delete draft projects */
    DELETE_PROJECTS = "DELETE_PROJECTS",
    /** Can view archived projects */
    READ_ARCHIVED_PROJECTS = "READ_ARCHIVED_PROJECTS",
    /** Can view active projects */
    READ_PROJECTS = "READ_PROJECTS",
    /** Can initialise draft projects (eg. confirm starting lineups) */
    INITIALISE_PROJECTS = "INITIALISE_PROJECTS",
    /** Can archive active projects */
    ARCHIVE_PROJECTS = "ARCHIVE_PROJECTS",
    /** Can create playtesting updates for a specific project */
    CREATE_PLAYTESTING_UPDATES = "CREATE_PLAYTESTING_UPDATES",
    /** Can read playtesting updates for any project */
    READ_PLAYTESTING_UPDATES = "READ_PLAYTESTING_UPDATES",
    /** Can view all playtesting cards */
    READ_ALL_CARDS = "READ_CARDS",
    /** Can view latest playtesting cards */
    READ_LATEST_CARDS = "READ_LATEST_CARDS",
    /** Can edit playtesting cards */
    EDIT_CARDS = "EDIT_CARDS",
    /** Can create playtesting cards or updates */
    CREATE_CARDS = "CREATE_CARDS",
    /** Can delete playtesting cards */
    DELETE_CARDS = "DELETE_CARDS",
    /** Can view all card suggestions */
    READ_SUGGESTIONS = "READ_SUGGESTIONS",
    /** Can create, edit and delete their own card suggestions */
    MAKE_SUGGESTIONS = "MAKE_SUGGESTIONS",
    /** Can edit other users card suggestions */
    EDIT_SUGGESTIONS = "EDIT_SUGGESTIONS",
    /** Can delete other users card suggestions */
    DELETE_SUGGESTIONS = "DELETE_SUGGESTIONS",
    /** Can import card suggestions in bulk */
    IMPORT_SUGGESTIONS = "IMPORT SUGGESTIONS",
    /** Can export card suggestions in bulk */
    EXPORT_SUGGESTIONS = "EXPORT_SUGGESTIONS",
    /** Can view all users */
    READ_USERS = "READ_USERS",
    /** Can edit all users */
    EDIT_USERS = "EDIT_USERS",
    /** Can view all roles */
    READ_ROLES = "READ_ROLES",
    /** Can edit all roles */
    EDIT_ROLES = "EDIT_ROLES",
    /** Can assign the Playtesting Team Discord role to yourself */
    ASSIGN_OWN_PLAYTESTING_ROLE = "ASSIGN_OWN_PLAYTESTING_ROLE",
    /** Can render cards to another format (eg. PDF, PNG)*/
    RENDER_CARDS = "RENDER_CARDS",
    /** Can view all card reviews */
    READ_REVIEWS = "READ_REVIEWS",
    /** Can create, edit and delete their own card reviews */
    MAKE_REVIEWS = "MAKE_REVIEWS",
    /** Can edit other users card reviews */
    EDIT_REVIEWS = "EDIT_REVIEWS",
    /** Can delete other users card reviews */
    DELETE_REVIEWS = "DELETE_REVIEWS",
    /** Can access & read from the card forum on discord */
    READ_DISCORD_CARD_FORUM = "READ_DISCORD_CARD_FORUM",
    /** Can access & read from the review forum on discord */
    READ_DISCORD_REVIEW_FORUM = "READ_DISCORD_REVIEW_FORUM",
    /** Can sync card images */
    SYNC_CARD_IMAGES = "SYNC_CARD_IMAGES",
    /** Can sync card discord forum threads */
    SYNC_CARD_DISCORD = "SYNC_CARD_DISCORD",
    /** Can sync card github issues */
    SYNC_CARD_GITHUB = "SYNC_CARD_GITHUB",
    /** Can sync playtesting update code pull requests */
    SYNC_PLAYTESTINGUPDATE_GITHUB_CODE = "SYNC_PLAYTESTINGUPDATE_GITHUB_CODE",
    /** Can sync playtesting update data pull requests */
    SYNC_PLAYTESTINGUPDATE_GITHUB_DATA = "SYNC_PLAYTESTINGUPDATE_GITHUB_DATA",
    /** Can sync review discord forum threads */
    SYNC_REVIEW_DISCORD = "SYNC_REVIEW_DISCORD"
}

export default Permission;

export type PermissionMeta = {
    label: string;
    group: string;
    dependencies?: SingleOrArray<Permission>;
};

export const permissionMeta: Record<Permission, PermissionMeta> = {
    [Permission.READ_PROJECTS]: { label: "Read", group: "Projects" },
    [Permission.READ_ARCHIVED_PROJECTS]: { label: "Read Archived", group: "Projects" },
    [Permission.CREATE_PROJECTS]: { label: "Create", group: "Projects", dependencies: Permission.READ_PROJECTS },
    [Permission.EDIT_PROJECTS]: { label: "Edit", group: "Projects", dependencies: Permission.READ_PROJECTS },
    [Permission.DELETE_PROJECTS]: { label: "Delete", group: "Projects", dependencies: Permission.READ_PROJECTS },
    [Permission.ARCHIVE_PROJECTS]: { label: "Archive", group: "Projects", dependencies: Permission.READ_PROJECTS },
    [Permission.INITIALISE_PROJECTS]: { label: "Initialise", group: "Projects", dependencies: Permission.READ_PROJECTS },
    [Permission.READ_PLAYTESTING_UPDATES]: { label: "Read Updates", group: "Playtesting", dependencies: Permission.READ_PROJECTS },
    [Permission.CREATE_PLAYTESTING_UPDATES]: { label: "Create Updates", group: "Playtesting", dependencies: Permission.READ_PROJECTS },
    [Permission.READ_ALL_CARDS]: { label: "Read All", group: "Cards", dependencies: Permission.READ_PROJECTS },
    [Permission.READ_LATEST_CARDS]: { label: "Read Latest", group: "Cards", dependencies: Permission.READ_PROJECTS },
    [Permission.CREATE_CARDS]: { label: "Create", group: "Cards", dependencies: [Permission.READ_PROJECTS, Permission.READ_ALL_CARDS] },
    [Permission.EDIT_CARDS]: { label: "Edit", group: "Cards", dependencies: [Permission.READ_PROJECTS, Permission.READ_ALL_CARDS] },
    [Permission.DELETE_CARDS]: { label: "Delete", group: "Cards", dependencies: [Permission.READ_PROJECTS, Permission.READ_ALL_CARDS] },
    [Permission.RENDER_CARDS]: { label: "Render", group: "Cards" },
    [Permission.READ_SUGGESTIONS]: { label: "Read", group: "Suggestions" },
    [Permission.MAKE_SUGGESTIONS]: { label: "Make Own", group: "Suggestions", dependencies: Permission.READ_SUGGESTIONS },
    [Permission.EDIT_SUGGESTIONS]: { label: "Edit Others", group: "Suggestions", dependencies: Permission.READ_SUGGESTIONS },
    [Permission.DELETE_SUGGESTIONS]: { label: "Delete Others", group: "Suggestions", dependencies: Permission.READ_SUGGESTIONS },
    [Permission.IMPORT_SUGGESTIONS]: { label: "Import", group: "Suggestions" },
    [Permission.EXPORT_SUGGESTIONS]: { label: "Export", group: "Suggestions" },
    [Permission.READ_REVIEWS]: { label: "Read", group: "Reviews" },
    [Permission.MAKE_REVIEWS]: { label: "Make Own", group: "Reviews", dependencies: Permission.READ_REVIEWS },
    [Permission.EDIT_REVIEWS]: { label: "Edit Others", group: "Reviews", dependencies: Permission.READ_REVIEWS },
    [Permission.DELETE_REVIEWS]: { label: "Delete Others", group: "Reviews", dependencies: Permission.READ_REVIEWS },
    [Permission.READ_USERS]: { label: "Read", group: "Users" },
    [Permission.EDIT_USERS]: { label: "Edit", group: "Users", dependencies: Permission.READ_USERS },
    [Permission.READ_ROLES]: { label: "Read", group: "Roles" },
    [Permission.EDIT_ROLES]: { label: "Edit", group: "Roles", dependencies: Permission.READ_ROLES },
    [Permission.ASSIGN_OWN_PLAYTESTING_ROLE]: { label: "Become Playtester", group: "Roles" },
    [Permission.READ_DISCORD_CARD_FORUM]: { label: "View Card Forum", group: "Discord" },
    [Permission.READ_DISCORD_REVIEW_FORUM]: { label: "View Review Forum", group: "Discord" },
    [Permission.SYNC_CARD_IMAGES]: { label: "Card Images", group: "Sync", dependencies: Permission.EDIT_CARDS },
    [Permission.SYNC_CARD_DISCORD]: { label: "Card Discord", group: "Sync", dependencies: Permission.EDIT_CARDS },
    [Permission.SYNC_CARD_GITHUB]: { label: "Card GitHub", group: "Sync", dependencies: Permission.EDIT_CARDS },
    [Permission.SYNC_PLAYTESTINGUPDATE_GITHUB_CODE]: { label: "PT Update Github Code", group: "Sync" },
    [Permission.SYNC_PLAYTESTINGUPDATE_GITHUB_DATA]: { label: "PT Update Github Data", group: "Sync" },
    [Permission.SYNC_REVIEW_DISCORD]: { label: "Review Discord", group: "Sync", dependencies: Permission.EDIT_REVIEWS }
};

export const permissionGroups = (Object.entries(permissionMeta) as [Permission, PermissionMeta][]).reduce<
    { label: string; permissions: { value: Permission; label: string }[] }[]
>((groups, [value, { label, group }]) => {
    let existing = groups.find(g => g.label === group);
    if (!existing) {
        existing = { label: group, permissions: [] };
        groups.push(existing);
    }
    existing.permissions.push({ value, label });
    return groups;
}, []);
