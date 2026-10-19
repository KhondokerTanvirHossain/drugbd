import { Fragment, type ReactNode } from "react";
import CopyButton from "@/components/qa/CopyButton";
import ExampleMarker from "@/components/ui/ExampleMarker";
import { QA_COPY } from "@/lib/copy";
import type { CodeBlock, Fill, QaReference, RefEndpoint, Sentence } from "@/lib/qa-api-reference";
import { QA_FILTERS } from "@/lib/qa-query";
import { SHARED_WORDS } from "@/lib/review-copy";
import styles from "./qa.module.css";

/*
 * §5.18 section 3 "API" (QA API reference, D72): "Every request and answer", the five endpoint panels, "Problem filters" and
 * "MCP over HTTP". A server component: every example, command and rule is server-rendered text from qaReference()
 * (lib/qa-api-reference.ts, server-only); the only island here is CopyButton, which reads its target's text from the DOM.
 * Panels are native <details> (no JavaScript); code scrolls inside its own labelled region; tables sit in labelled scroll
 * regions with captions; h4 headings carry the request as sr-only text.
 */

const C = QA_COPY.reference;
const P = QA_COPY.page;

const FILTER_TEXT: Record<(typeof QA_FILTERS)[number], string> = {
  strength_missing: P.filterStrengthMissing, parse_partial: P.filterParsePartial, route_assumed: P.filterRouteAssumed,
  no_ddinter_data: P.filterNoDdinterData, unaligned: P.filterUnaligned, stage_warn: P.filterStageWarn, stage_fail: P.filterStageFail,
};

const mono = (text: string) => <code className={styles.mono}>{text}</code>;

/** One placeholder's fill: text as is, code in mono, a list of codes joined by ", ". */
function fillNode(fill: Fill | undefined, name: string): ReactNode {
  if (fill === undefined) return `{${name}}`;
  if (typeof fill === "string") return fill;
  if ("code" in fill) return mono(fill.code);
  return fill.codes.map((c, i) => <Fragment key={c}>{i > 0 ? ", " : ""}{mono(c)}</Fragment>);
}

/** A §1.7 sentence with its `{name}` placeholders filled; `extra` adds nodes (the Example marker). */
function say(s: Sentence | string, extra: Record<string, ReactNode> = {}): ReactNode[] {
  const { template, fills } = typeof s === "string" ? { template: s, fills: {} as Sentence["fills"] } : s;
  return template.split(/\{(\w+)\}/).map((part, i) => (
    <Fragment key={i}>{i % 2 === 0 ? part : part in extra ? extra[part] : fillNode(fills[part], part)}</Fragment>
  ));
}

const fill = (template: string, request: string) => template.replace("{request}", request);
const forRequest = (request: string) => <span className="sr-only">{fill(C.forRequest, request)}</span>;

function Code({ block }: { block: CodeBlock }) {
  return (
    <>
      <div className={styles.codeHead}>
        <span className={styles.codeLabel}>{block.label}</span>
        <ExampleMarker />
        <CopyButton target={block.id} label={block.copyLabel} context={block.context || undefined} />
      </div>
      <div className={styles.codeRegion} role="region" tabIndex={0} aria-label={block.region}>
        <pre id={block.id} className={styles.codeBlock}>{block.text}</pre>
      </div>
    </>
  );
}

function Table({ caption, head, children }: { caption: string; head: string[]; children: ReactNode }) {
  return (
    <div className={styles.scroll} role="region" aria-label={caption} tabIndex={0}>
      <table className={styles.table}>
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const yesNo = (required: boolean) => (required ? SHARED_WORDS.yes : SHARED_WORDS.no);

function Summary({ request, returns }: { request: string; returns: string }) {
  return (
    <summary className={styles.summary}>
      <code className={styles.summaryPath}>{request}</code>
      <span className={styles.summaryText}>{returns}</span>
    </summary>
  );
}

function Endpoint({ e, open, header }: { e: RefEndpoint; open: boolean; header: string }) {
  return (
    <details id={e.id} className={styles.endpoint} open={open}>
      <Summary request={e.request} returns={e.returns} />
      <div className={styles.endpointBody}>
        <h4>{C.request}{forRequest(e.request)}</h4>
        <p>{mono(e.address)}</p>
        <p>{say(C.requiredHeader, { header: mono(header) })}</p>
        {e.params.length === 0 ? <p>{C.noParams}</p> : (
          <Table caption={fill(C.paramsCaption, e.request)} head={[C.colParameter, C.colIn, C.colRequired, C.colRule]}>
            {e.params.map((p) => (
              <tr key={p.name}>
                <td>{mono(p.name)}</td>
                <td>{p.in === "path" ? C.inPath : C.inQuery}</td>
                <td>{yesNo(p.required)}</td>
                <td>{say(p.rule)}</td>
              </tr>
            ))}
          </Table>
        )}
        <p>{C.otherParams}</p>
        <Code block={e.command} />

        <h4>{C.response}{forRequest(e.request)}</h4>
        <Code block={e.answer} />
        <p className={styles.codeLabel}>{C.keyFields}</p>
        <dl className={styles.filters}>
          {e.keyFields.map((f) => <Fragment key={f.path}><dt>{f.path}</dt><dd>{f.text}</dd></Fragment>)}
        </dl>

        <h4>{C.errors}{forRequest(e.request)}</h4>
        <Table caption={fill(C.errorsCaption, e.request)} head={[SHARED_WORDS.status, SHARED_WORDS.code, C.colWhen, C.colFix]}>
          {e.errors.map((r) => (
            <tr key={r.status}><td>{r.status}</td><td>{mono(r.code)}</td><td>{say(r.when)}</td><td>{r.fix}</td></tr>
          ))}
        </Table>
      </div>
    </details>
  );
}

function Mcp({ m }: { m: QaReference["mcp"] }) {
  return (
    <details id={m.id} className={styles.endpoint}>
      <Summary request={m.request} returns={m.returns} />
      <div className={styles.endpointBody}>
        <h4>{C.request}{forRequest(m.request)}</h4>
        <p>{mono(`POST ${m.address}`)}</p>
        <Table caption={fill(C.headersCaption, m.request)} head={[C.colHeader, C.colValue, C.colRequired]}>
          {m.headers.map((h) => <tr key={h.name}><td>{mono(h.name)}</td><td>{mono(h.value)}</td><td>{yesNo(h.required)}</td></tr>)}
        </Table>
        <p>{C.acceptLine}</p>
        <p>{say(m.versionLine)}</p>
        <p>{say(m.bodyLine)}</p>

        <h4>{C.initializeHeading}{forRequest(m.request)}</h4>
        <p>{C.initializeLead}</p>
        <Code block={m.initialize.command} />
        <Code block={m.initialize.answer} />

        <h4>{C.callHeading}{forRequest(m.request)}</h4>
        <p>{say(m.call.lead)}</p>
        <Code block={m.call.command} />
        <Code block={m.call.answer} />

        <h4>{C.toolsHeading}{forRequest(m.request)}</h4>
        <Table caption={C.toolsCaption} head={[C.colTool, C.colArguments, C.colSameData]}>
          {m.tools.map((t) => (
            <tr key={t.name}>
              <td>{mono(t.name)}</td>
              <td>{t.args.length === 0 ? C.noArguments : t.args.map((a, i) => (
                <Fragment key={a.name}>{i > 0 ? ", " : ""}{mono(a.name)}{a.required ? C.argRequired : C.argOptional}</Fragment>
              ))}</td>
              <td>{mono(t.request)}</td>
            </tr>
          ))}
        </Table>
        <p>{say(m.argsLine)}</p>

        <h4>{C.errors}{forRequest(m.request)}</h4>
        <Table caption={fill(C.errorsCaption, m.request)} head={[SHARED_WORDS.status, C.colRpcCode, C.colMessage, C.colFix]}>
          {m.errors.map((r) => (
            <tr key={r.message}><td>{r.status}</td><td>{mono(r.code)}</td><td>{mono(r.message)}</td><td>{say(r.fix)}</td></tr>
          ))}
        </Table>
      </div>
    </details>
  );
}

/** The reference: sits in the "API" section after its lead and base address (app/review/qa/page.tsx). */
export default function ApiReference({ reference }: { reference: QaReference }) {
  const { common, endpoints, mcp } = reference;
  return (
    <>
      <h3 id="qa-api-common">{C.commonHeading}</h3>
      <p>{say(common.lead)}</p>
      <p>{P.envelopeLine}</p>
      <dl className={styles.filters}>
        <dt>success</dt><dd>{C.envSuccess}</dd>
        <dt>data</dt><dd>{C.envData}</dd>
        <dt>message</dt><dd>{C.envMessage}</dd>
        <dt>errors</dt><dd>{C.envErrors}</dd>
        <dt>metadata</dt><dd>{C.envMetadata}</dd>
      </dl>
      <Code block={common.error} />
      <p>{say(common.exampleNote, { marker: <ExampleMarker /> })}</p>
      <p>{say(common.headersLine)}</p>
      <p>{say(common.pageLine)}</p>
      <p>{C.notFoundLine}</p>

      <h3 id="qa-api-endpoints">{SHARED_WORDS.endpoints}</h3>
      <p>{C.endpointsLead}</p>
      {endpoints.map((e, i) => <Endpoint key={e.id} e={e} open={i === 0} header={reference.header} />)}

      <h3 id="qa-api-filters">{P.filtersHeading}</h3>
      <dl className={styles.filters}>
        {QA_FILTERS.map((f) => <Fragment key={f}><dt>{f}</dt><dd>{FILTER_TEXT[f]}</dd></Fragment>)}
      </dl>

      <h3 id="qa-api-mcp">{C.mcpHeading}</h3>
      <p>{C.mcpLead}</p>
      <Mcp m={mcp} />
    </>
  );
}
