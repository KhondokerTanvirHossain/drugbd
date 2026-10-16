import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/Button";
import NoDataBlock from "@/components/ui/NoDataBlock";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import { PUBLIC_BOARD, PUBLIC_NEW, fill } from "@/lib/copy";
import type { CheckResult } from "@/lib/public-types";
import { LANDING } from "@/lib/public-copy";
import { fillNodes } from "@/lib/review-copy";
import { formatCount, type SiteStats } from "@/lib/stats";
import { REGISTER_PRODUCTS } from "@/content/site";
import styles from "./landing.module.css";

const Mono = ({ children }: { children: ReactNode }) => <span className="mono">{children}</span>;

/** The live pilot stat (§6.1): one batch in review names it; several give their count; none leaves the stat out. */
function PilotStat({ stats }: { stats: SiteStats }) {
  const inReview = stats.batches.filter((b) => b.status === "in_review");
  if (stats.inReviewProducts === 0 || inReview.length === 0) return null;
  return (
    <div className={styles["s-stat"]}>
      <b>{formatCount(stats.inReviewProducts)}</b>
      <span>{inReview.length === 1
        ? fillNodes(LANDING.statPilot, { id: <Mono>{inReview[0].batchId}</Mono> })
        : fill(PUBLIC_NEW.hero.statBatches, { k: inReview.length })}</span>
    </div>
  );
}

/** The real public response for the sample's ids, in the API envelope (§6.1, §7.4); timestamp and request id elided. */
function responseBody(result: CheckResult): string {
  return JSON.stringify({ success: true, data: result, message: "OK", errors: [], metadata: { timestamp: "…", requestId: "…" } }, null, 2);
}

export default function Landing({ stats, hero, sample }:
    { stats: SiteStats | null; hero: ReactNode; sample: { ids: string[]; result: CheckResult | null } }) {
  const noneApproved = sample.result !== null && sample.result.products.length === 0 && sample.result.notReviewed.length === sample.ids.length;
  return (
    <>
      <section className={styles["s-hero"]} aria-labelledby="landing-h1">
        <div>
          {stats && stats.inReviewProducts > 0 && <p className={styles["s-pilot"]}>{fill(LANDING.pilot, { n: formatCount(stats.inReviewProducts) })}</p>}
          <h1 id="landing-h1" className={styles.h1}>{LANDING.h1}</h1>
          <p className={`${styles["s-lede"]} ${styles.wide}`}>{LANDING.lede}</p>
          <p className={`${styles["s-lede"]} ${styles.narrow}`}>{LANDING.ledeNarrow}</p>
          <div className={styles["s-ctas"]}>
            <a className={buttonClass("primary", "lg")} href="/check">{LANDING.ctaCheck}</a>
            <a className={buttonClass("tonal", "lg")} href="/search">{LANDING.ctaSearch}</a>
          </div>
          <p className={`${styles["s-fine"]} ${styles.wide}`}>{LANDING.fine}</p>
        </div>
        {hero}
      </section>

      <section className={styles["s-stats"]} aria-label={LANDING.statsLabel}>
        <div className={styles["s-stat"]}><b>{formatCount(REGISTER_PRODUCTS)}</b><span>{LANDING.statRegister}</span></div>
        <div className={styles["s-stat"]}><b>{LANDING.statCodesN}</b><span>{LANDING.statCodes}</span></div>
        <div className={styles["s-stat"]}><b>{LANDING.statKindsN}</b><span>{LANDING.statKinds}</span></div>
        {stats && <PilotStat stats={stats} />}
      </section>

      <section className={styles["s-band"]} aria-labelledby="band-aud">
        <h2 id="band-aud" className={styles["s-h2"]}>{LANDING.audHeading}</h2>
        <p className={styles["s-sub"]}>{LANDING.audSub}</p>
        <div className={styles["s-aud"]}>
          {LANDING.audiences.map((a) => (
            <article key={a.title}>
              <h3 className={styles.h3}>{a.title}</h3>
              <p className={styles["s-who"]}>{a.who}</p>
              <ul className={styles["s-ticks"]}>
                {a.ticks.map(([before, bold, after]) => <li key={before}><span>{before}<b>{bold}</b>{after}</span></li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles["s-band"]} ${styles["s-band--tint"]}`} aria-labelledby="band-how">
        <h2 id="band-how" className={styles["s-h2"]}>{LANDING.howHeading}</h2>
        <p className={styles["s-sub"]}>{LANDING.howSub}</p>
        <ol className={styles["s-steps"]}>
          {LANDING.steps.map((s, i) => (
            <li key={s.title} className={i === 4 ? `${styles["s-st"]} ${styles["s-st--final"]}` : styles["s-st"]}>
              <span className={styles["s-st-no"]}>{i + 1}</span>
              <h3 className={styles.h3s}>{s.title}</h3>
              <p>{s.body}</p>
              <span className={styles["s-st-eg"]}>
                {i === 0 && <span className="raw">{LANDING.stepRaw}</span>}
                {i === 1 && <>{LANDING.stepClinical} <Mono>{LANDING.stepBdc}</Mono></>}
                {i === 2 && <>
                  <span className={`stage-status ${styles.stOk}`}>OK</span>
                  <span className={`stage-status ${styles.stWarn}`}>Warning</span>
                  <span className={`stage-status ${styles.stFail}`}>Failed</span>
                </>}
                {i === 3 && <ReviewStatus status="pending" />}
                {i === 4 && <ReviewStatus status="approved" />}
              </span>
            </li>
          ))}
        </ol>
        <div className={styles["s-loop-row"]} aria-hidden="true"><span className={styles["s-loop"]} /></div>
        <div className={styles["s-loop-row"]}>
          <p className={styles["s-loop-label"]}><b>{LANDING.loopLead}</b><ReviewStatus status="back_in_review" />{LANDING.loopText}</p>
        </div>
      </section>

      <section className={styles["s-band"]} aria-labelledby="band-prom">
        <h2 id="band-prom" className={styles["s-h2"]}>{LANDING.promisesHeading}</h2>
        <p className={styles["s-sub"]}>{LANDING.promisesSub}</p>
        <div className={styles["s-prom"]}>
          <article>
            <h3 className={styles.h3}>{LANDING.promiseNoData}</h3>
            <NoDataBlock title={LANDING.promiseNoDataName} bdsId={LANDING.promiseNoDataId} />
            <p>{LANDING.promiseNoDataNote}</p>
          </article>
          <article>
            <h3 className={styles.h3}>{LANDING.promiseApproval}</h3>
            <div className={styles["s-prom-row"]}>
              <ReviewStatus status="pending" /><ReviewStatus status="approved" /><ReviewStatus status="back_in_review" />
            </div>
            <p>{LANDING.promiseApprovalNote}</p>
          </article>
          <article>
            <h3 className={styles.h3}>{PUBLIC_BOARD.unknownPromise}</h3>
            <div className={styles["s-prom-row"]}><Severity level="unknown" /><Severity level="minor" /></div>
            <p>{LANDING.promiseUnknownNote}</p>
          </article>
        </div>
      </section>

      <section className={`${styles["s-band"]} ${styles["s-band--tint"]}`} aria-labelledby="band-api">
        <div className={styles["s-api"]}>
          <div className={styles["s-api-l"]}>
            <h2 id="band-api" className={styles["s-h2"]}>{LANDING.partnersHeading}</h2>
            <p className={styles["s-sub"]}>{LANDING.partnersSub}</p>
            <ul className={styles["s-ticks"]}>
              <li><span>{LANDING.partnerTicks[0]}</span></li>
              <li><span>{LANDING.partnerTicks[1]}<b>{LANDING.partnerTickBold}</b>.</span></li>
              <li><span>{LANDING.partnerTicks[2]}<Mono>{LANDING.partnerEnvelope}</Mono>.</span></li>
            </ul>
            <div className={styles["s-row"]}>
              <a className={buttonClass("primary")} href="/partners">{LANDING.requestAccess}</a>
              <span className={styles["s-who"]}>{LANDING.requestNote}</span>
            </div>
          </div>
          <div className={styles["s-code"]}>
            <figure>
              <figcaption><Mono>{LANDING.codeRequest}</Mono></figcaption>
              <pre tabIndex={0} aria-label={LANDING.codeRequestLabel}>{JSON.stringify({ conceptIds: sample.ids }, null, 2)}</pre>
            </figure>
            {sample.result && (
              <figure>
                <figcaption>{LANDING.responseToday}{noneApproved && <> {LANDING.responseNoneApproved}</>}</figcaption>
                <pre tabIndex={0} aria-label={LANDING.codeResponseLabel}>{responseBody(sample.result)}</pre>
              </figure>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
