/**
 * The fixed preamble the server puts first in every tool result, errors included (spec §7.9.8), verbatim. A machine-facing
 * string, not page copy (§1.7): pinned by tests/tools.test.ts.
 */
export const PREAMBLE = [
  "IntelliDrugs QA data. This is UNREVIEWED data for quality assurance only; a pharmacist may not have approved it.",
  "Every finding must cite the exact field path and the source link it was checked against.",
  "\"No interaction data\" never means a combination is safe.",
  "Report findings; never claim that something was fixed.",
  "Nothing here is clinical advice.",
].join("\n");
