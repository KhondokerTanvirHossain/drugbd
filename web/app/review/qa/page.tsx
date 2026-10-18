import { cookies } from "next/headers";
import { Fragment, type ReactNode } from "react";
import CopyButton from "@/components/qa/CopyButton";
import QaKeys from "@/components/qa/QaKeys";
import { KEYS_HEADING_ID, QA_LIVE_ID } from "@/components/qa/live";
import ReviewToolbar from "@/components/review/ReviewToolbar";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { listQaKeys } from "@/lib/api";
import { QA_COPY } from "@/lib/copy";
import { KEYS_COOKIE, parseKeys } from "@/lib/desk-settings";
import { cspNonce } from "@/lib/nonce";
import { QA_FILTERS } from "@/lib/qa-api";
import { toQaKeyView, type QaKeyView } from "@/lib/qa-key-types";
import { PREAMBLE, TOOLS } from "@/lib/qa-mcp-tools";
import { qaSnippets } from "@/lib/qa-snippets";
import { DESK, SHARED_WORDS } from "@/lib/review-copy";
import { canUseQa } from "@/lib/reviewers";
import { getSession, type Session } from "@/lib/session";
import { siteHost } from "@/lib/site";
import { THEME_COOKIE, parseTheme, type Theme } from "@/lib/theme";
import { turnstileSiteKey } from "@/lib/turnstile";
import reviewStyles from "../review.module.css";
import styles from "./qa.module.css";

export const dynamic = "force-dynamic";

const P = QA_COPY.page;
const K = QA_COPY.keys;

/** Fills `{name}` placeholders in a §1.7 string with nodes (mono code), keeping the sentence verbatim around them. */
function fillNodes(template: string, nodes: Record<string, ReactNode>): ReactNode[] {
  return template.split(/\{(\w+)\}/).map((part, i) => <Fragment key={i}>{i % 2 === 1 ? nodes[part] ?? `{${part}}` : part}</Fragment>);
}

const FILTER_TEXT: Record<(typeof QA_FILTERS)[number], string> = {
  strength_missing: P.filterStrengthMissing, parse_partial: P.filterParsePartial, route_assumed: P.filterRouteAssumed,
  no_ddinter_data: P.filterNoDdinterData, unaligned: P.filterUnaligned, stage_warn: P.filterStageWarn, stage_fail: P.filterStageFail,
};
const ENDPOINTS: [string, string][] = [
  ["GET /batches", P.returnsBatches],
  ["GET /batches/{batchId}", P.returnsBatch],
  ["GET /batches/{batchId}/records/{conceptId}", P.returnsRecord],
  ["GET /records?filter={filter}", P.returnsRecords],
  ["GET /substances/{bdsId}/pairs", P.returnsPairs],
];

function Shell({ session, theme, keys, children }: { session: Session; theme: Theme; keys: "on" | "off"; children: ReactNode }) {
  return (
    <div className={reviewStyles.shell}>
      <ReviewToolbar session={session} theme={theme} batchId={null} keys={keys} current="qa" />
      <main id="content" className={reviewStyles.page}>
        {/* §10.2: the page's one polite live region; both islands announce through it. */}
        <div id={QA_LIVE_ID} role="status" className="sr-only" />
        {children}
      </main>
    </div>
  );
}

/**
 * §5.18 QA tools (QA portal, D66, D67, D69, D70): connect your AI, your keys, the API and the rules, for qa, engineer and
 * senior. A pharmacist gets an info banner with no key read; app/review/layout.tsx has answered anonymous visitors (sign-in)
 * and readers (not authorised). The page reads nothing but the viewer's own key list: no batch, no review read.
 */
export default async function QaToolsPage() {
  const session = await getSession();
  if (!session) return null;   // app/review/layout.tsx has already answered
  const store = await cookies();
  const theme = parseTheme(store.get(THEME_COOKIE)?.value);
  const keysSetting = parseKeys(store.get(KEYS_COOKIE)?.value);

  if (session.role === "pharmacist") {
    return (
      <Shell session={session} theme={theme} keys={keysSetting}>
        <Banner tone="info" titleAs="h1" title={P.pharmacistTitle} body={P.pharmacistBody} />
        <div className={reviewStyles.actions}>
          <a className={buttonClass("tonal")} href="/review">{DESK.openDesk}</a>
        </div>
      </Shell>
    );
  }
  if (!canUseQa(session.role)) return null;   // `user`: the layout's not-authorised page

  let keys: QaKeyView[] | null;
  try {
    keys = (await listQaKeys(session.email)).map(toQaKeyView).filter((k): k is QaKeyView => k !== null);
  } catch {
    keys = null;
  }
  const s = qaSnippets(siteHost());
  const siteKey = turnstileSiteKey();
  const code = (text: string) => <code className={styles.mono}>{text}</code>;
  const names = TOOLS.map((t) => code(t.name));

  return (
    <Shell session={session} theme={theme} keys={keysSetting}>
      <div className={styles.intro}>
        <h1>{P.heading}</h1>
        <p className={styles.sub}>{P.sub}</p>
      </div>

      <section className={styles.section} aria-labelledby="connect">
        <h2 id="connect">{P.connectHeading}</h2>
        <p>{P.connectLead}</p>
        <div className={styles.value}>
          <span className={styles.valueLabel}>{P.mcpAddressLabel}</span>
          <code id="qa-mcp-address" className={styles.mono}>{s.mcp}</code>
          <CopyButton target="qa-mcp-address" label={P.copyAddress} />
        </div>
        <h3>{P.claudeCodeHeading}</h3>
        <pre id="qa-claude-code" className={styles.pre}>{s.claudeCode}</pre>
        <div className={styles.row}><CopyButton target="qa-claude-code" label={P.copyCommand} /></div>
        <p className={styles.help}>{P.claudeCodeHelp}</p>
        <h3>{P.cursorHeading}</h3>
        <pre id="qa-cursor" className={styles.pre}>{s.cursor}</pre>
        <div className={styles.row}><CopyButton target="qa-cursor" label={P.copyConfiguration} /></div>
        <p className={styles.help}>{P.cursorHelp}</p>
        <h3>{P.oauthHeading}</h3>
        <p>{P.oauthBody}</p>
        <p>{fillNodes(P.toolsLine, { t1: names[0], t2: names[1], t3: names[2], t4: names[3], t5: names[4], path: code("tools/qa-mcp") })}</p>
      </section>

      <section className={styles.section} aria-labelledby={KEYS_HEADING_ID}>
        <h2 id={KEYS_HEADING_ID} tabIndex={-1}>{K.heading}</h2>
        {keys === null ? (
          <Banner tone="crit" title={K.loadErrorTitle} body={K.loadErrorBody}
            action={<a className={buttonClass("tonal", "sm")} href="/review/qa">{K.tryAgain}</a>} />
        ) : (
          <QaKeys keys={keys} siteKey={siteKey} nonce={siteKey ? await cspNonce() : undefined} />
        )}
      </section>

      <section className={styles.section} aria-labelledby="api">
        <h2 id="api">{P.apiHeading}</h2>
        <p>{P.apiLead}</p>
        <div className={styles.value}>
          <span className={styles.valueLabel}>{P.apiBaseLabel}</span>
          <code id="qa-api-address" className={styles.mono}>{s.api}</code>
          <CopyButton target="qa-api-address" label={P.copyAddress} />
        </div>
        <div className={styles.scroll} role="region" aria-label={P.endpointsCaption} tabIndex={0}>
          <table className={styles.table}>
            <caption className="sr-only">{P.endpointsCaption}</caption>
            <thead><tr><th scope="col">{P.colRequest}</th><th scope="col">{P.colReturns}</th></tr></thead>
            <tbody>
              {ENDPOINTS.map(([request, returns]) => (
                <tr key={request}><td className={styles.request}>{request}</td><td>{returns}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>{P.filtersHeading}</h3>
        <dl className={styles.filters}>
          {QA_FILTERS.map((f) => (
            <Fragment key={f}><dt>{f}</dt><dd>{FILTER_TEXT[f]}</dd></Fragment>
          ))}
        </dl>
        <h3>{SHARED_WORDS.example}</h3>
        <pre id="qa-curl" className={styles.pre}>{s.curl}</pre>
        <div className={styles.row}><CopyButton target="qa-curl" label={P.copyExample} /></div>
        <p>{P.envelopeLine}</p>
      </section>

      <section className={styles.section} aria-labelledby="rules">
        <h2 id="rules">{P.rulesHeading}</h2>
        <p>{P.rulesLead}</p>
        <ol className={styles.rules}>
          {PREAMBLE.split("\n").map((line) => <li key={line}>{line}</li>)}
        </ol>
        <p>{P.rulesKeys}</p>
      </section>
    </Shell>
  );
}
