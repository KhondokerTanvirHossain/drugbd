/*
 * §1.7 "Public page could not load (`app/error.tsx`)" (P2 final review finding 3). It lives apart from lib/copy.ts only
 * because the root error boundary is a client island that loads with every route (§10.6): lib/copy.ts re-exports it as
 * NEW_COPY's row, so copy.test.ts pins and guards it like every other §1.7 string.
 */
export const PAGE_ERROR = {
  title: "Couldn't load this page.",
  body: "Nothing was changed. Check your connection and try again.",
  tryAgain: "Try again",
} as const;
