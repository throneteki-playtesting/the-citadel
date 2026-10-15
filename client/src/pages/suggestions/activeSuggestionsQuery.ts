// The whole active pool the dashboard's statistics are drawn from, shared by the Suggestion Spread and the stats beside
// it so both read one cache entry. Archived is left out explicitly - the server only does so for those who can't manage
// the archive - and the viewer's own ignored suggestions kept in, since the list hides them by default.
export const ACTIVE_SUGGESTIONS_QUERY = { filter: { archived: { $exists: false } }, includeIgnored: true };
