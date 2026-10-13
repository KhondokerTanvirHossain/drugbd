const WORD = { same: "Matches", norm: "Normalised", salt: "Salt removed", added: "Added", differs: "Differs" } as const;
/** §3.4 MatchRelation: comparison tables only. */
export default function MatchRelation({ kind, sub }: { kind: keyof typeof WORD; sub?: string }) {
  return <><span className={`match match--${kind}`}>{WORD[kind]}</span>{sub && <span className="cmp-sub">{sub}</span>}</>;
}
