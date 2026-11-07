/*
 * §6.11.1 the HeaderSearch island's strings. They live apart from lib/copy.ts and lib/public-copy.ts only because the
 * island loads with every page's root layout (§10.6): lib/copy.ts re-exports HEADER_SEARCH and lib/public-copy.ts builds
 * NAV's search field from SEARCH_FIELD, so tests/browse-copy.test.ts and the NAV tests pin them like every other row.
 */

/** §6.1 the header's search field: its sr-only label and its placeholder (NAV.searchLabel, NAV.searchPlaceholder). */
export const SEARCH_FIELD = { label: "Search medicines", placeholder: "Brand, substance or DAR number" } as const;

/** §6.11.1 the HeaderSearch island: its sr-only help (`hs-help`) and the last option of an open list. */
export const HEADER_SEARCH = {
  help: "Suggestions appear as you type. Up and down arrows to move, Enter to open, Esc to close.",
  allResults: "All results for “{q}”",
} as const;
