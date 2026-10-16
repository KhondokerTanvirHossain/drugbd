import type { ReactNode } from "react";
import CodeChip from "@/components/ui/CodeChip";
import MatchRelation from "@/components/ui/MatchRelation";
import NoDataChip from "@/components/ui/NoDataChip";
import { SourceOf } from "@/components/ui/SourceLink";
import { DESK_NEW, NO_DATA_SENTENCE, NOT_RUN, fill } from "@/lib/copy";
import {
  NAME_TYPE_LABEL, formRelation, genericRelation, nameRelation, strengthRelation, strengthText, xmRelation, type Relation,
} from "@/lib/relations";
import { DESK, fillNodes, plural } from "@/lib/review-copy";
import type { IngredientSummary, ReviewItem } from "@/lib/review-types";
import s from "./detail.module.css";

const Rel = ({ r }: { r: Relation }) => <MatchRelation kind={r.kind} sub={r.sub} />;

function Row({ th, src, rel, ext }: { th: string; src: ReactNode; rel: ReactNode; ext: ReactNode }) {
  return <tr><th scope="row">{th}</th><td className="cmp-src">{src}</td><td className={s.relCell}>{rel}</td><td>{ext}</td></tr>;
}

const notInRegister = <span className={`cmp-sub ${s.flush}`}>{DESK.notInRegister}</span>;
const meta = (c: IngredientSummary["codes"][number]) =>
  ({ method: c.method, confidence: c.confidence, route: c.system === "DDINTER" ? c.routeScope : undefined });

function mapping(g: IngredientSummary): ReactNode {
  if (g.coverage.coverage === "none")
    return <><NoDataChip label="No data" /><span className={`cmp-sub ${s.strong}`}>{NO_DATA_SENTENCE}</span></>;
  if (g.coverage.coverage === "not_run") return <span className="cmp-sub">{NOT_RUN}</span>;
  const dd = g.codes.filter((c) => c.system === "DDINTER");
  return (
    <>
      <div className={`codes ${s.codesTight}`}>{dd.map((c) => <CodeChip key={c.code} system={c.system} code={c.code} meta={meta(c)} source={c.source} />)}</div>
      <span className="cmp-sub">{DESK.dataFound}</span>
      {g.ddinter.chosen.map((c) => (
        <span className="cmp-sub" key={c.ddinterId}>
          {fillNodes(DESK_NEW.routeAware.mappingChecked, { id: <span className="mono">{c.ddinterId}</span>, route: c.routeScope })}
          {c.routeAssumed && DESK_NEW.routeAware.routeAssumedSuffix}
        </span>
      ))}
    </>
  );
}

/** §5.5.2 "DGDA source against the extraction". Relations come from lib/relations (Board R's rules). */
export default function ComparisonTable({ item }: { item: ReviewItem }) {
  const b = item.brand, cd = item.clinicalDrug, ings = item.ingredients, multi = ings.length > 1;
  const n = (k: number) => (multi ? ` ${k + 1}` : "");
  const mapped = ings.filter((g) => g.bdsId !== null);
  const copied = <span className={s.copy}>{DESK.copied}</span>;
  return (
    <section className={s.sec} aria-labelledby="sec-cmp">
      <div className={s.secT}><h2 id="sec-cmp">{DESK.cmpTitle}</h2><span>{DESK.cmpSub}</span></div>
      <div className={`cmp-wrap ${s.cmpWrap}`} tabIndex={0} role="region" aria-labelledby="sec-cmp">
        <table className="cmp">
          <caption className="sr-only">{fill(DESK.cmpCaption, { name: b?.tradeName ?? item.conceptId })}</caption>
          <thead><tr><th scope="col">{DESK.cmpField}</th><th scope="col" className={`cmp-src ${s.srcHead}`}>{DESK.cmpSource}{b?.source && <> <SourceOf source={b.source} /></>}</th>
            <th scope="col">{DESK.cmpRelation}</th><th scope="col">{DESK.cmpExtracted}</th></tr></thead>
          <tbody>
            {b && <Row th="Trade name" src={b.tradeName} rel={copied} ext={<>{b.tradeName}<span className="cmp-sub mono">{item.conceptId}</span></>} />}
            {b && <Row th="Company" src={b.company} rel={copied} ext={b.company} />}
            {b && <Row th="Dosage form" src={b.dosageForm} rel={<Rel r={formRelation(b.dosageForm, cd?.doseForm ?? null)} />} ext={cd?.doseForm ?? ""} />}
            {b && <Row th="Generic content" src={<span className="raw">{b.genericContentRaw}</span>}
              rel={<Rel r={genericRelation(b.genericContentRaw, ings)} />}
              ext={<>{ings.map((g, k) => <span key={k}>{k > 0 && <br />}{g.name} {strengthText(g)}</span>)}
                <span className="cmp-sub">{fill(DESK.parsed, { k: ings.length, ingredients: plural(ings.length, "ingredient", "ingredients") })}</span></>} />}
            {ings.flatMap((g, k) => {
              const src = <><span className="raw">{g.raw}</span>{multi && <span className="cmp-sub">{DESK.parserPart}</span>}</>;
              return [
                <Row key={`s${k}`} th={`Substance${n(k)}`} src={src} rel={<Rel r={nameRelation(g)} />}
                  ext={<>{g.name}{g.bdsId && <span className="cmp-sub mono">{g.bdsId}</span>}</>} />,
                <Row key={`t${k}`} th={`Strength${n(k)}`} src={src} rel={<Rel r={strengthRelation(g)} />} ext={strengthText(g)} />,
              ];
            })}
            {item.dgdaIngredients.map((x) => {
              const { relation, match } = xmRelation(x.xmCode, ings);
              const xmSource = ings.flatMap((g) => g.codes).find((c) => c.system === "ICD11_XM" && c.code === x.xmCode)?.source ?? null;
              return (
                <Row key={x.xmCode} th="DGDA ingredient code"
                  src={<><span className="mono">{x.xmCode}</span>{xmSource && <> <SourceOf source={xmSource} /></>}<span className="cmp-sub">{x.name}</span></>}
                  rel={<Rel r={relation} />}
                  ext={match ? <><span className="mono">{match.bdsId}</span> {match.name}<span className={s.cmpNames}>{fill(DESK.names, {
                    names: match.names.map((nm) => `${nm.name} (${NAME_TYPE_LABEL[nm.type] ?? nm.type})`).join(", ") })}</span></>
                    : DESK.noMatchingSubstance} />
              );
            })}
            {cd && <Row th="Clinical drug" src={notInRegister} rel={<Rel r={{ kind: "added" }} />}
              ext={<>{cd.displayName}<span className="cmp-sub"><span className="mono">{cd.bdcId}</span>{fill(DESK.clinicalSub, {
                route: cd.route ?? "", form: cd.doseForm })}</span></>} />}
            {mapped.map((g) => {
              const codes = g.codes.filter((c) => c.system !== "DDINTER");
              return <Row key={`c${g.bdsId}`} th={`Codes${n(ings.indexOf(g))}`} src={notInRegister}
                rel={<Rel r={{ kind: "added", sub: fill(DESK.codesFor, { k: codes.length, name: g.name }) }} />}
                ext={<div className={`codes ${s.codesTight}`}>{codes.map((c) => <CodeChip key={`${c.system}${c.code}`} system={c.system} code={c.code} meta={meta(c)} source={c.source} />)}</div>} />;
            })}
            {mapped.map((g) => <Row key={`d${g.bdsId}`} th={`DDInter mapping${n(ings.indexOf(g))}`} src={notInRegister}
              rel={<Rel r={{ kind: "added" }} />} ext={mapping(g)} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}
