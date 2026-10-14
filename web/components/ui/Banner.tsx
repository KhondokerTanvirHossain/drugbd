import type { ReactNode } from "react";

export type BannerTone = "info" | "warn" | "crit";
/** §3.4 Banner: a bold first sentence, what was or was not saved, then one action. */
export default function Banner({ tone, title, body, action, role }:
    { tone: BannerTone; title: ReactNode; body?: ReactNode; action?: ReactNode; role?: "status" | "alert" | "note" }) {
  return (
    <div className={`banner banner--${tone}`} role={role}>
      <p className="banner-title">{title}</p>
      {body !== undefined && <p className="banner-body">{body}</p>}
      {action !== undefined && <span className="banner-action">{action}</span>}
    </div>
  );
}
