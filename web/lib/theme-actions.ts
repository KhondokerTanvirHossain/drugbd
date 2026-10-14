"use server";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme, themeCookieOptions } from "./theme";

/** The theme form's action. Without JavaScript the form posts here and the page re-renders in the new theme. */
export async function setThemeAction(formData: FormData): Promise<void> {
  (await cookies()).set(THEME_COOKIE, parseTheme(formData.get("theme")), themeCookieOptions());
}
