import { P1C_COPY, fill } from "@/lib/copy";
import { fmtDhakaDate } from "@/lib/format";
import type { Source } from "@/lib/review-types";
import "./SourceLink.css";

/**
 * §3.4 SourceLink: a plain link to the source page the API built (SourceLinks.java; the web never builds a source URL),
 * opening in a new tab, then " fetched on {DD/MM/YYYY}" (Dhaka) when a fetch time is stored. Nothing without a URL.
 */
export default function SourceLink({ url, label, fetchedAt }: { url: string | null | undefined; label: string; fetchedAt?: string | null }) {
  if (!url) return null;
  const s = P1C_COPY.sources;
  return (
    <>
      <a className="src-link" href={url} target="_blank" rel="noopener noreferrer">{label}<span className="sr-only">{s.newTab}</span></a>
      {fetchedAt ? fill(s.fetchedOn, { date: fmtDhakaDate(fetchedAt) }) : null}
    </>
  );
}

/** The API's `source` field, or nothing (a code that failed its system's pattern has no link, §5.6.6). */
export function SourceOf({ source }: { source: Source | null | undefined }) {
  return source ? <SourceLink url={source.url} label={source.label} fetchedAt={source.fetchedAt} /> : null;
}
