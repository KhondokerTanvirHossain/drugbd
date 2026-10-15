/**
 * Note drafts: per record (§5.10 reports, §5.10a dismissals) or per pair (§5.17.2), in memory, mirrored to
 * sessionStorage; never outliving the session.
 */
export const DRAFT_PREFIX = "intellidrugs-draft:";
export const DISMISS_DRAFT_PREFIX = "intellidrugs-dismiss-draft:";
export const PAIR_DRAFT_PREFIX = "intellidrugs-pair-draft:";
const PREFIXES = [DRAFT_PREFIX, DISMISS_DRAFT_PREFIX, PAIR_DRAFT_PREFIX];
export const draftKey = (batchId: string, conceptId: string) => `${DRAFT_PREFIX}${batchId}:${conceptId}`;
export const dismissDraftKey = (batchId: string, conceptId: string) => `${DISMISS_DRAFT_PREFIX}${batchId}:${conceptId}`;
export const pairDraftKey = (ddinterA: string, ddinterB: string) => `${PAIR_DRAFT_PREFIX}${ddinterA}:${ddinterB}`;
const memory = new Map<string, string>();

export function loadDraftAt(k: string): string {
  try {
    const v = window.sessionStorage.getItem(k);
    if (v !== null) return v;
  } catch {
    // storage blocked: memory only
  }
  return memory.get(k) ?? "";
}

export function saveDraftAt(k: string, value: string): void {
  if (value) memory.set(k, value); else memory.delete(k);
  try {
    if (value) window.sessionStorage.setItem(k, value); else window.sessionStorage.removeItem(k);
  } catch {
    // storage blocked: memory only
  }
}

export const loadDraft = (batchId: string, conceptId: string) => loadDraftAt(draftKey(batchId, conceptId));
export const saveDraft = (batchId: string, conceptId: string, value: string) => saveDraftAt(draftKey(batchId, conceptId), value);
export const clearDraft = (batchId: string, conceptId: string) => saveDraft(batchId, conceptId, "");

/** Sign-out removes every draft (§5.10, §5.10a, §5.17.2); POST /signout's Clear-Site-Data covers the no-JavaScript case. */
export function clearAllDrafts(): void {
  memory.clear();
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const k = window.sessionStorage.key(i);
      if (k && PREFIXES.some((p) => k.startsWith(p))) window.sessionStorage.removeItem(k);
    }
  } catch {
    // nothing stored
  }
}
