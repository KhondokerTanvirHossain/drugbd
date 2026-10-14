import type { ReactNode } from "react";

const WORD = { ok: "OK", warn: "Warning", fail: "Failed" } as const;
/** §3.4 StageCheck: the icon and the word always appear together. Notes are the pipeline's own. */
export default function StageCheck({ name, status, children }: { name: string; status: keyof typeof WORD; children?: ReactNode }) {
  return (
    <div className={`stage stage--${status}`}>
      <p className="stage-head"><span className="stage-name">{name}</span><span className="stage-status">{WORD[status]}</span></p>
      {children}
    </div>
  );
}
