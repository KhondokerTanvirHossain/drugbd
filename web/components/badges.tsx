import type { ReactNode } from "react";
import styles from "./badges.module.css";

/** A small inline label, e.g. a route ("ophthalmic"). Legacy pages only; P2 replaces it with ui/ components. */
export function Badge({ children }: { children: ReactNode }) {
  return <span className={`badge ${styles.badge}`}>{children}</span>;
}

/** A stage status label: ok / warn / fail, or "not run" when the stage wrote no result. */
export function StatusPill({ status }: { status: string | null }) {
  const kind = status === "ok" || status === "warn" || status === "fail" ? status : "none";
  return <span className={`pill pill-${kind} ${styles.pill} ${styles[kind]}`}>{status ?? "not run"}</span>;
}
