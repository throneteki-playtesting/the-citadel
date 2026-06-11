enum Permission {
    /** Can create new projects */
    CREATE_PROJECTS = "CREATE_PROJECTS",
    /** Can edit existing projects */
    EDIT_PROJECTS = "EDIT_PROJECTS",
    /** Can delete existing projects */
    DELETE_PROJECTS = "DELETE_PROJECTS",
    /** Can view all projects */
    READ_ALL_PROJECTS = "READ_ALL_PROJECTS",
    /** Can view active projects */
    READ_PROJECTS = "READ_PROJECTS",
    /** Can initialise draft projects (eg. confirm starting lineups) */
    INITIALISE_PROJECTS = "INITIALISE_PROJECTS",
    /** Can create playtesting updates for a specific project */
    CREATE_PLAYTESTING_UPDATES = "CREATE_PLAYTESTING_UPDATES",
    /** Can read playtesting updates for any project */
    READ_PLAYTESTING_UPDATES = "READ_PLAYTESTING_UPDATES",
    /** Can view playtesting cards */
    READ_CARDS = "READ_CARDS",
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
    /** Can sync card images */
    SYNC_CARD_IMAGES = "SYNC_CARD_IMAGES",
    /** Can sync card discord forum threads */
    SYNC_CARD_DISCORD = "SYNC_CARD_DISCORD",
    /** Can sync card github issues */
    SYNC_CARD_GITHUB = "SYNC_CARD_GITHUB",
    /** Can sync card github pull requests */
    SYNC_PROJECT_GITHUB = "SYNC_PROJECT_GITHUB",
    /** Can sync review discord forum threads */
    SYNC_REVIEW_DISCORD = "SYNC_REVIEW_DISCORD"
}

export default Permission;