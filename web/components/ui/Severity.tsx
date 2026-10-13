import { SEVERITY_NOT_CLASSIFIED } from "@/lib/copy";
import { severityOf, type Severity as Level } from "@/lib/severity";

const LABEL: Record<Level, string> = { major: "Major", moderate: "Moderate", minor: "Minor", unknown: SEVERITY_NOT_CLASSIFIED };
const CLASS: Record<Level, string> = { major: "sev--major", moderate: "sev--moderate", minor: "sev--minor", unknown: "sev--unclassified" };

/** §3.4 Severity: square chip with words. Any value other than major/moderate/minor is "not classified". */
export default function Severity({ level, count }: { level: Level | (string & {}); count?: number }) {
  const s = severityOf(level);
  return (
    <span className={`sev ${CLASS[s]}`}>
      {LABEL[s]}{count !== undefined && <> <b className="sev-n">{count}</b></>}
    </span>
  );
}
