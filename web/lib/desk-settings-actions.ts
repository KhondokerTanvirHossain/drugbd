"use server";
import { cookies } from "next/headers";
import { KEYS_COOKIE, UNDO_COOKIE, deskCookieOptions, parseKeys, parseUndo } from "./desk-settings";

/** The settings forms' action (§5.14): without JavaScript the form posts here and the desk re-renders with the new value. */
export async function setDeskSettingAction(formData: FormData): Promise<void> {
  const store = await cookies();
  if (formData.has("undo")) store.set(UNDO_COOKIE, String(parseUndo(formData.get("undo"))), deskCookieOptions());
  if (formData.has("keys")) store.set(KEYS_COOKIE, parseKeys(formData.get("keys")), deskCookieOptions());
}
