"use client";
import { useEffect, useState, type MouseEvent } from "react";
import Segmented from "@/components/ui/Segmented";
import { THEMES, THEME_EVENT, applyTheme, themeCookieString, type Theme } from "@/lib/theme";
import { setThemeAction } from "@/lib/theme-actions";

const LABEL: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

/**
 * Island (§3.3, §4.2). A <form> with three submit buttons that works without JavaScript (setThemeAction). With
 * JavaScript a click sets data-theme at once, writes the cookie and skips the round trip.
 */
export default function ThemeSwitch({ value }: { value: Theme }) {
  const [theme, setTheme] = useState<Theme>(value);

  useEffect(() => {
    const sync = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);

  function choose(e: MouseEvent<HTMLButtonElement>, next: Theme) {
    e.preventDefault();
    applyTheme(document.documentElement, next);
    document.cookie = themeCookieString(next, window.location.protocol === "https:");
    window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: next }));
  }

  return (
    <form action={setThemeAction}>
      <Segmented ariaLabel="Colour theme" name="theme" value={theme} onSelect={choose}
        options={THEMES.map((t) => ({ value: t, label: LABEL[t] }))} />
    </form>
  );
}
