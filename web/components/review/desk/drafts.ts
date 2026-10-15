/** §5.10 note drafts: per record, in memory, mirrored to sessionStorage; never outliving the session. */
export const DRAFT_PREFIX = "intellidrugs-draft:";
export const draftKey = (batchId: string, conceptId: string) => `${DRAFT_PREFIX}${batchId}:${conceptId}`;
const memory = new Map<string, string>();

export function loadDraft(batchId: string, conceptId: string): string {
  const k = draftKey(batchId, conceptId);
  try {
    const v = window.sessionStorage.getItem(k);
    if (v !== null) return v;
  } catch {
    // storage blocked: memory only
  }
  return memory.get(k) ?? "";
}

export function saveDraft(batchId: string, conceptId: string, value: string): void {
  const k = draftKey(batchId, conceptId);
  if (value) memory.set(k, value); else memory.delete(k);
  try {
    if (value) window.sessionStorage.setItem(k, value); else window.sessionStorage.removeItem(k);
  } catch {
    // storage blocked: memory only
  }
}

export const clearDraft = (batchId: string, conceptId: string) => saveDraft(batchId, conceptId, "");

/** Sign-out removes every draft (§5.10); POST /signout's Clear-Site-Data covers the no-JavaScript case. */
export function clearAllDrafts(): void {
  memory.clear();
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const k = window.sessionStorage.key(i);
      if (k?.startsWith(DRAFT_PREFIX)) window.sessionStorage.removeItem(k);
    }
  } catch {
    // nothing stored
  }
}
