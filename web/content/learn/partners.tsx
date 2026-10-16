import { Fragment } from "react";
import type { LearnContext } from "@/components/learn/context";
import styles from "@/components/learn/learn.module.css";
import { Chapter, ScrollRegion, Section, SnapshotBlock } from "@/components/learn/parts";
import Banner from "@/components/ui/Banner";
import ExampleMarker from "@/components/ui/ExampleMarker";
import NoDataChip from "@/components/ui/NoDataChip";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import { FULL_TEXT, LEARN_BOARD, NOT_REVIEWED, NO_DATA_SENTENCE } from "@/lib/copy";
import { P, PILOT_SNAPSHOT as S, type PilotId, substanceNamed, substancesOf } from "./pilot-snapshot";

const H = 2;

// ---- The endpoint table: every mapping in api/…/presentation/*Controller.java (learn-partners.test.ts pins the set). ----

export type Access = "Public" | "All" | "Reviewer" | "Token";
export type Endpoint = { method: "GET" | "POST"; path: string; what: string; access: Access[] };
export const ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/v1/products?q=&page=", what: "Search by brand or ingredient text, 20 a page", access: ["Public", "All"] },
  { method: "GET", path: "/v1/products/loaded", what: "A light list for the checker's picker: concept id, trade name, dosage form", access: ["Public", "All"] },
  { method: "GET", path: "/v1/products/{conceptId}", what: "One product with ingredients, clinical drug and DDInter entries. Unapproved: a hidden stub.", access: ["Public", "All"] },
  { method: "GET", path: "/v1/substances/{bdsId}", what: "Names, codes, coverage, products, and drug, disease and food interactions by severity", access: ["Public", "All"] },
  { method: "GET", path: "/v1/substances/{bdsId}/interactions?severity=&page=", what: "A substance's DDInter pairs with their text, 20 a page", access: ["Public", "All"] },
  { method: "GET", path: "/v1/search?q=&page=", what: "Search by brand, substance or DAR number: approved records, and stubs for the rest", access: ["Public", "All"] },
  { method: "GET", path: "/v1/products/suggest?q=&exclude=", what: "Up to 10 suggestions for the checker. Unapproved rows match on trade name and DAR only.", access: ["Public"] },
  { method: "GET", path: "/v1/products/{conceptId}/interactions?page=", what: "Pairs with approved products of every batch, by partner substance, 20 a page", access: ["Public", "All"] },
  { method: "GET", path: "/v1/clinical-drugs/{bdcId}", what: "A clinical drug, its ingredients and its approved brands", access: ["Public", "All"] },
  { method: "POST", path: "/v1/interactions/check", what: "Checks a list of products: alerts, duplicates, noData, notReviewed", access: ["Public", "All"] },
  { method: "GET", path: "/v1/stats", what: "Counts, and each batch's records by trade name and public status", access: ["Public"] },
  { method: "GET", path: "/v1/batches", what: "All batches, newest first", access: ["Reviewer"] },
  { method: "GET", path: "/v1/batches/{batchId}", what: "Every record with extracted data, raw DGDA JSON, stage results and review state", access: ["Reviewer"] },
  { method: "GET", path: "/v1/batches/{batchId}/report", what: "Stage counts, review progress, warnings, the last 5 runs, change since the previous run", access: ["Reviewer"] },
  { method: "POST", path: "/v1/batches/{b}/items/{c}/decisions", what: 'Records "ok" or "issue". A stale page gets 409.', access: ["Token"] },
  { method: "GET", path: "/v1/batches/{b}/items/{c}/decisions", what: "Decision history, newest first, with notes, roles and reviewer emails. Internal token only.", access: ["Reviewer"] },
  { method: "GET", path: "/v1/review/batches", what: "Batches with their review counts", access: ["Reviewer"] },
  { method: "GET", path: "/v1/review/batches/{b}/items?show=&q=", what: "A batch's records with display status and triage hints", access: ["Reviewer"] },
  { method: "GET", path: "/v1/review/batches/{b}/versions", what: "Each record's version, for stale detection", access: ["Reviewer"] },
  { method: "GET", path: "/v1/review/batches/{b}/items/{c}", what: "One record for the review desk: source, extraction, checks, interactions and history", access: ["Reviewer"] },
  { method: "GET", path: "/v1/review/batches/{b}/items/{c}/diff?from=", what: "What changed since an earlier extraction", access: ["Reviewer"] },
  { method: "GET", path: "/v1/review/pairs?show=&pairs=&severity=&page=", what: "Senior review: the interaction pairs to review, with each pair's review state", access: ["Reviewer"] },
  { method: "GET", path: "/v1/review/substances?q=&page=", what: "Senior review: substances with their pair counts across all batches", access: ["Reviewer"] },
  { method: "GET", path: "/v1/review/substances/{bdsId}", what: "Senior review: one substance's pairs across all batches", access: ["Reviewer"] },
  { method: "POST", path: "/v1/review/pairs/{a}/{b}/decisions", what: "Records a senior's pair decision. A changed pair or a newer review gets 409.", access: ["Token"] },
  { method: "POST", path: "/v1/flags", what: "Creates a problem report", access: ["Token"] },
  { method: "GET", path: "/v1/flags?status=", what: "Open or resolved problem reports", access: ["Token"] },
  { method: "POST", path: "/v1/flags/{id}/resolve", what: "Marks a report resolved", access: ["Token"] },
  { method: "POST", path: "/v1/audit-events", what: "Records a sign-in, sign-out or review event for the audit trail", access: ["Token"] },
];

/** Board L's "Planned endpoints" (api-versions). learn-partners.test.tsx fails once a controller serves one of them. */
export const PLANNED = ["/v1/releases"] as const;

// ---- The example bodies, in the §7.4 shapes (§1.6 item 13; learn-partners.test.ts pins them). ----

const META = { timestamp: "2026-10-12T04:00:00Z", requestId: "3b8f1c2e-6a4d-4f0e-9c1b-2d7e5a9f0c11" };
const envelope = <T,>(data: T) => ({ success: true, data, message: "OK", errors: [] as unknown[], metadata: META });
/** DDInter's first sentence, then an ellipsis: the bodies are cut here for space (the figcaption says so). */
const cut = (text: string) => `${text.slice(0, text.indexOf(". ") + 1)} …`;

const napa = S.records[P.napa];
const [acet] = substancesOf(P.napa);
const warfS = substanceNamed("Warfarin"), aspS = substanceNamed("Acetylsalicylic acid"), dompS = substanceNamed("Domperidone");
const side = (id: typeof P.warfarin | typeof P.aspirin | typeof P.domperidone, s: typeof warfS) =>
  ({ conceptId: id, tradeName: S.records[id].tradeName, bdsId: s.bdsId, name: s.name, routeScope: s.entries[0]?.route ?? null });
const ref = (s: typeof warfS) => s.entries.map((e) => ({ ddinterId: e.id, name: s.name, routeScope: e.route, routeAssumed: false }));
const CHECK_IDS = [P.warfarin, P.aspirin, P.domperidone] as const;
const synergy = S.actionExamples.find((e) => e.action === "synergy")!;

export const ENVELOPE = envelope({});
export const PRODUCT_PUBLIC = envelope({ conceptId: P.napa, tradeName: napa.tradeName, status: "not_reviewed", batchId: S.batchId, hidden: true });
export const PRODUCT_REVIEWER = envelope({
  conceptId: P.napa, darNumber: napa.darNumber, tradeName: napa.tradeName, company: napa.company, dosageForm: napa.dosageForm,
  genericContentRaw: napa.genericContentRaw, qualityFlag: null, ingredients: [{ xmCode: acet.codes.icd11, name: acet.name }],
  parseStatus: "parsed", parseNote: null,
  clinicalDrug: { bdcId: napa.bdcId, displayName: napa.clinicalDrug, doseForm: napa.dosageForm, route: napa.route,
    ingredients: [{ bdsId: acet.bdsId, name: acet.name, strengthValue: 500, strengthUnit: "mg", perValue: null, perUnit: null, ddinter: ref(acet) }] },
});
export const CHECK_REQUEST = { conceptIds: [...CHECK_IDS] };
const NONE = { major: 0, moderate: 0, minor: 0, unknown: 0 };
export const CHECK_PUBLIC = envelope({
  summary: { medicines: 3, totalPairs: 0, checkedPairs: 0, alertPairs: 0, noInteractionPairs: 0, notCheckedPairs: 0, notReviewed: 3, bySeverity: NONE },
  products: [], alerts: [], noInteraction: [], notChecked: [], duplicates: [], noData: [],
  notReviewed: CHECK_IDS.map((id) => ({ conceptId: id, tradeName: S.records[id].tradeName })),
});
export const CHECK_REVIEWER = envelope({
  summary: { medicines: 3, totalPairs: 3, checkedPairs: 1, alertPairs: 1, noInteractionPairs: 0, notCheckedPairs: 2, notReviewed: 0,
    bySeverity: { ...NONE, major: 1 } },
  products: CHECK_IDS.map((id, i) => {
    const s = [warfS, aspS, dompS][i];
    return { conceptId: id, tradeName: S.records[id].tradeName, substances: [{ bdsId: s.bdsId, name: s.name, coverage: s.coverage, ddinter: ref(s) }] };
  }),
  alerts: [{
    severity: "major", a: side(P.warfarin, warfS), b: side(P.aspirin, aspS), actions: ["synergy"],
    interaction: cut(synergy.interaction!), management: cut(S.workedCheck.management), routeAssumed: false,
    ddinterA: warfS.entries[0].id, ddinterB: aspS.entries[0].id, interactionId: null, source: "DDInter 2.0",
  }],
  noInteraction: [],
  notChecked: [{ a: side(P.domperidone, dompS), b: side(P.warfarin, warfS), reason: "no_data" },
    { a: side(P.domperidone, dompS), b: side(P.aspirin, aspS), reason: "no_data" }],
  duplicates: [],
  noData: [{ conceptId: P.domperidone, bdsId: dompS.bdsId, name: dompS.name }],
  notReviewed: [],
});
const json = (v: unknown) => JSON.stringify(v, null, 2);

/**
 * The "Public / Reviewer access" switch (§6.8). Server-rendered hidden: without JavaScript both panels show, one after
 * the other. The LearnRail island (Task 13a, `wireExampleSwitches`) un-hides it and shows one panel at a time.
 */
function ExampleSwitch({ name, panels }: { name: string; panels: [string, string] }) {
  return (
    <div className="seg" role="group" aria-label="Who is asking" data-switch={name} hidden>
      <button type="button" aria-pressed="true" data-panel={panels[0]}>Public</button>
      <button type="button" aria-pressed="false" data-panel={panels[1]}>Reviewer access</button>
    </div>
  );
}

function Code({ label, value }: { label: string; value: unknown }) {
  return <pre className={styles.codePre} tabIndex={0} role="region" aria-label={label}>{json(value)}</pre>;
}

/** Chapter 8 "For partners" (Board L; §1.6 items 13 and 16, §6.8). */
export default function PartnersChapter({ ctx }: { ctx: LearnContext }) {
  // An approval-state sentence prints only for a record /v1/stats reports as not approved, never from a fallback (§6.8).
  const said = (id: PilotId) => ctx.item(id) !== null && ctx.pending(id);
  const napaCaption = ctx.apiStub && said(P.napa);
  const noneApproved = CHECK_IDS.every(said);
  return (
    <Chapter slug="partners" level={1}>
      <Section id="api-status" h={H}>
        <Banner tone="info" title="The API runs on the internal network today"
          body="The website calls it privately. Partner API keys, usage metering, OpenAPI docs and monthly releases are planned. The endpoint paths below come from the API controllers; the response bodies shown on this page are illustrative and their field names may change." />
      </Section>

      <Section id="api-endpoints" h={H}>
        <ScrollRegion label="Endpoint table, scrolls sideways">
          <table className={`${styles.tbl} ${styles.tblWide} ${styles.ep}`}>
            <caption>All endpoints under /v1, from the API controllers</caption>
            <thead><tr><th scope="col">Method and path</th><th scope="col">What it returns</th><th scope="col">Access</th></tr></thead>
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={`${e.method} ${e.path}`}>
                  <td><span className={styles.method}>{e.method}</span> <span className="mono">{e.path}</span></td>
                  <td>{e.what}</td>
                  <td>{e.access.map((a) => <span key={a} className={styles.acc}>{a}</span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <dl className={styles.dgRead}>
          <div><dt>Public</dt><dd>The default. Approved records only; anything else is reported as not reviewed.</dd></div>
          <div><dt>All</dt><dd><span className="mono">scope=all</span> with the internal token, used only by integration tests. Reviewers read unreviewed data through <span className="mono">/v1/review/*</span>.</dd></div>
          <div><dt>Reviewer</dt><dd>Batch evidence, including extracted data no pharmacist has checked yet, is readable only by signed-in reviewers. Reviewer emails are never shown on public pages or in public API answers. Readers and the public API see only the id, trade name and review status of an unapproved product.</dd></div>
          <div><dt>Token</dt><dd>Writes need the internal token. A wrong token is refused with 401.</dd></div>
        </dl>
      </Section>

      <Section id="api-envelope" h={H}>
        <div className={styles.env}>
          <Code label="Response envelope" value={ENVELOPE} />
          <dl>
            <div><dt>success</dt><dd>true when the request worked.</dd></div>
            <div><dt>data</dt><dd>The product, substance, check result or list. <span className="mono">null</span> on an error.</dd></div>
            <div><dt>message</dt><dd>"OK", or the error in plain words.</dd></div>
            <div><dt>errors</dt><dd>Empty on success. Otherwise each error has <span className="mono">field</span>, <span className="mono">code</span> and <span className="mono">message</span>.</dd></div>
            <div><dt>metadata</dt><dd>When the response was made and a request id to quote when you report a problem. <ExampleMarker /> values shown.</dd></div>
          </dl>
        </div>
      </Section>

      <Section id="api-product" h={H}>
        <div className={styles.exHead}>
          <p className={styles.req}><span className={styles.method}>GET</span>/v1/products/{P.napa}</p>
          <ExampleSwitch name="prod" panels={["prod-public", "prod-all"]} />
        </div>
        <div id="prod-public">
          <Code label="Public response for Napa" value={PRODUCT_PUBLIC} />
          {napaCaption && <p className={styles.figcap}>Napa is not approved yet, so a public caller gets its id, trade name and status "not_reviewed", with <span className="mono">hidden: true</span>. Show "{NOT_REVIEWED}". Never show "not found".</p>}
        </div>
        <div id="prod-all">
          <SnapshotBlock ctx={ctx} ids={[P.napa]}>
            <Code label="Reviewer response for Napa" value={PRODUCT_REVIEWER} />
            <p className={styles.figcap}>The same product with <span className="mono">scope=all</span>. Field names come from the API's Product record and values from the pilot.</p>
          </SnapshotBlock>
        </div>
        <p className={styles.small}>The <span className="mono">timestamp</span> and <span className="mono">requestId</span> in these examples are <ExampleMarker /> values.</p>
      </Section>

      <Section id="api-check" h={H}>
        <div className={styles.exHead}>
          <p className={styles.req}><span className={styles.method}>POST</span>/v1/interactions/check</p>
          <ExampleSwitch name="chk" panels={["chk-public", "chk-all"]} />
        </div>
        <Code label="Request body" value={CHECK_REQUEST} />
        <div id="chk-public">
          <Code label="Public check response" value={CHECK_PUBLIC} />
          {noneApproved && <p className={styles.figcap}>None of the three is approved, so a public check lists all three in <span className="mono">notReviewed</span> and checks nothing. An empty <span className="mono">alerts</span> here does not mean the medicines are safe together.</p>}
        </div>
        <div id="chk-all">
          <SnapshotBlock ctx={ctx} ids={[P.warfarin, P.aspirin, P.domperidone]}>
            <Code label="Reviewer check response" value={CHECK_REVIEWER} />
            <p className={styles.figcap}>With reviewer access: one Major alert and Domperidone in <span className="mono">noData</span>. The interaction and management strings are cut here for space; the API returns DDInter's full text.</p>
          </SnapshotBlock>
        </div>
      </Section>

      <Section id="api-must" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>These values are why the API exists. A partner screen that hides them can make missing data look like a clean result.</p>
        <ul className={styles.must}>
          <li><code>coverage: "none"</code><br /><code>noData[]</code><div className={styles.show}><NoDataChip label="No interaction data" /><span>Show in full: "{NO_DATA_SENTENCE}" Count its pairs as not checked.</span></div></li>
          <li><code>severity: "unknown"</code><div className={styles.show}><Severity level="unknown" /><span>{LEARN_BOARD.unclassifiedMust}</span></div></li>
          <li><code>hidden: true</code>, <code>status "not_reviewed"</code> or <code>"removed"</code><br /><code>notReviewed[]</code><div className={styles.show}><ReviewStatus status="pending" /><span>Never "not found", never "no data".</span></div></li>
          <li><code>routeAssumed: true</code><div className={styles.show}><span>Say the route was assumed: the product's own route had no DDInter entry, so the systemic entry was used.</span></div></li>
          <li><code>interaction: null</code><br /><code>management: null</code><div className={styles.show}><span>DDInter has no text for this part. Leave it out; never print "None".</span></div></li>
          <li><code>source: "DDInter 2.0"</code><div className={styles.show}><span>Attribute the text. If you shorten it, say "{FULL_TEXT}" and link to it.</span></div></li>
        </ul>
      </Section>

      <Section id="api-versions" h={H}>
        <div className={styles.grid2}>
          <div className={styles.card}>
            <p className={styles.h4}>Now</p>
            <ul className={`${styles.bul} ${styles.small}`}>
              <li>Every path starts with <span className="mono">/v1</span>.</li>
              <li>The database schema is locked at a reviewed version. Changes arrive as new reviewed migrations: a minor version for additions, a major version for anything that alters or removes structure.</li>
              <li>Each response carries a timestamp and request id.</li>
            </ul>
          </div>
          <div className={styles.card}>
            <p className={styles.h4}>Planned</p>
            <ul className={`${styles.bul} ${styles.small}`}>
              <li>A monthly, read-only release of approved records, named by month, such as <span className="mono">2026.11</span>.</li>
              <li>Every response names its release, and each release is diffed against the last. No silent deletions.</li>
              <li>Monthly DGDA and RxNorm refresh, quarterly DDInter re-crawl.</li>
              <li>Planned endpoints: {PLANNED.map((p, i) => <Fragment key={p}>{i > 0 && ", "}<span className="mono">{p}</span></Fragment>)}.</li>
            </ul>
          </div>
        </div>
      </Section>
    </Chapter>
  );
}
