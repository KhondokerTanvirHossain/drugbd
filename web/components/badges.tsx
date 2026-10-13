import type { ReactNode } from "react";

const BADGE = { display: "inline-block", padding: "0 6px", borderRadius: 4, border: "1px solid #888",
  fontSize: "0.85em", background: "#f2f2f2" } as const;

/** A small inline label, e.g. a route ("ophthalmic"). */
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge" style={BADGE}>{children}</span>;
}

const PILL: Record<string, { background: string; color: string }> = {
  ok: { background: "#d7f5dd", color: "#0b5d1e" },
  warn: { background: "#fff1c2", color: "#6b4e00" },
  fail: { background: "#fbd5d5", color: "#8a1111" },
  none: { background: "#eee", color: "#444" },
};

/** A stage status pill: ok / warn / fail, or "not run" when the stage wrote no result. */
export function StatusPill({ status }: { status: string | null }) {
  const kind = status === "ok" || status === "warn" || status === "fail" ? status : "none";
  return (
    <span className={`pill pill-${kind}`} style={{ ...PILL[kind], padding: "0 8px", borderRadius: 999, fontSize: "0.85em" }}>
      {status ?? "not run"}
    </span>
  );
}
