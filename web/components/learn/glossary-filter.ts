/** The glossary filter's pure parts (§6.8). Client-safe; the GlossaryFilter island and its tests use them. */

/** The server-rendered list the island filters; each term is a child with `data-gl-item`. */
export const GLOSSARY_LIST_ID = "gl-list";
/** The attribute of the page's one polite, sr-only live region (§10.2), rendered by LearnShell on every Learn page. */
export const LEARN_LIVE_ATTR = "data-learn-live";
/** "updated 350 ms after typing stops" (§6.8). */
export const COUNT_DELAY_MS = 350;

const fold = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** A term's searchable text: its term, definition and pilot example, whitespace collapsed, lower-cased. */
export const haystack = (text: string): string => fold(text);

/** A literal, case-insensitive substring match; an empty or blank query matches everything (Review Focus 3). */
export const matches = (hay: string, query: string): boolean => {
  const q = fold(query);
  return q === "" || hay.includes(q);
};

export const countText = (shown: number, total: number, query: string): string =>
  (fold(query) === "" ? `Showing all ${total} terms` : `Showing ${shown} of ${total} terms`);
