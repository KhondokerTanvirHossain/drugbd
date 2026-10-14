/** §10.2: messages are set by clearing the region and writing after 60 ms. Client-safe; no React, no "use client". */
export const ANNOUNCE_DELAY_MS = 60;

/** Clears `region`, writes `text` after 60 ms, and returns a function that cancels the pending write. */
export function announce(region: HTMLElement | null, text: string): () => void {
  if (!region) return () => {};
  region.textContent = "";
  const timer = setTimeout(() => { region.textContent = text; }, ANNOUNCE_DELAY_MS);
  return () => clearTimeout(timer);
}
