import type { ReactNode } from "react";

export type BannerTone = "info" | "warn" | "crit";
/** §3.4 Banner: a bold first sentence, what was or was not saved, then one action. */
export default function Banner({ tone, title, body, action, role, titleAs: Title = "p" }:
    { tone: BannerTone; title: ReactNode; body?: ReactNode; action?: ReactNode; role?: "status" | "alert" | "note";
      /** "h1" when the banner is the whole page (the public error boundary, §10.5 one h1 per page). Same look. */
      titleAs?: "p" | "h1" }) {
  return (
    <div className={`banner banner--${tone}`} role={role}>
      <Title className="banner-title">{title}</Title>
      {body !== undefined && <p className="banner-body">{body}</p>}
      {action !== undefined && <span className="banner-action">{action}</span>}
    </div>
  );
}
