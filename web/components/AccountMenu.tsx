"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { clearAllDrafts } from "@/components/review/desk/drafts";
import styles from "./AccountMenu.module.css";

/** Island (§4.2): a <details> menu that also closes on Esc (focus back to the summary) and on a press outside. */
export default function AccountMenu({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !el.open) return;
      el.open = false;
      el.querySelector<HTMLElement>("summary")?.focus();
    };
    const onPress = (e: Event) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    // Sign-out removes every note draft (§5.10); POST /signout's Clear-Site-Data covers the no-JavaScript case.
    const onSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement;
      if (new URL(form.action, window.location.href).pathname === "/signout") clearAllDrafts();
    };
    el.addEventListener("submit", onSubmit);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPress);
      el.removeEventListener("submit", onSubmit);
    };
  }, []);
  return <details ref={ref} className={styles.menu}>{children}</details>;
}
