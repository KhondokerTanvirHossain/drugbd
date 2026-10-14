const SYSTEM: Record<string, string> = { ICD11_XM: "ICD-11", RXCUI: "RxCUI", ATC: "ATC", DRUGBANK: "DrugBank",
  SNOMEDCT: "SNOMED CT", DDINTER: "DDInter" };
export type CodeMeta = { method: string; confidence: number; route?: string };
const conf = (c: number) => (Number.isInteger(c) ? c.toFixed(1) : String(c));

/** §3.4 CodeChip. Reviewer screens pass `meta`; public pages show the method in the codes table instead. */
export default function CodeChip({ system, code, meta }: { system: string; code: string; meta?: CodeMeta }) {
  return (
    <span className="code">
      <span className="code-sys">{SYSTEM[system] ?? system}</span>{code}
      {meta && <span className="code-meta">{[meta.method, conf(meta.confidence), meta.route].filter(Boolean).join(", ")}</span>}
    </span>
  );
}
