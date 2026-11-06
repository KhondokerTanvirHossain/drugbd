import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/Button";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { PUBLIC_NEW, SHOW_COPY } from "@/lib/copy";
import type { PublicMode } from "@/lib/public-mode";
import type { ProductStub as Stub, SubstanceStub } from "@/lib/public-types";
import { PRODUCT, STUB } from "@/lib/public-copy";
import { fillNodes } from "@/lib/review-copy";
import styles from "./product.module.css";

/** The §6.4 stub pattern, shared by products and substances: crumb, h1, mono id, the NOT_REVIEWED pill, sentences, search. */
export function StubLayout({ name, id, children }: { name: string; id: string; children: ReactNode }) {
  return (
    <section className={styles["s-stub"]}>
      <nav aria-label={PRODUCT.crumbLabel}><p className={styles["s-crumb"]}><a href="/search">{PRODUCT.crumbRoot}</a><span aria-hidden="true">/</span><span>{name}</span></p></nav>
      <h1 className={styles.stubH1}>{name}</h1>
      <p className="mono">{id}</p>
      <span className={styles.fit}><ReviewStatus status="pending" /></span>
      {children}
      <p className={styles["s-row"]}><a className={buttonClass("tonal")} href="/search">{STUB.searchOther}</a></p>
    </section>
  );
}

/**
 * §6.4: status 200, never 404. Every non-approved state, issue and removed included, reads NOT_REVIEWED. In show mode
 * (§6.10) a stub is served only for a hidden product, and its lines say why: removed, a DGDA load failure, or in no batch.
 */
export default function ProductStub({ stub, mode = "approved_only" }: { stub: Stub; mode?: PublicMode }) {
  if (mode === "show_unreviewed" && stub.status !== "removed") {
    return (
      <StubLayout name={stub.tradeName} id={stub.conceptId}>
        {stub.status === "unavailable" ? <>
          <p>{SHOW_COPY.stubUnavailable}</p>
          {stub.batchId && <p>{fillNodes(SHOW_COPY.stubUnavailableBatch, { batchId: <span className="mono">{stub.batchId}</span> })}</p>}
        </> : <p>{SHOW_COPY.stubNoBatch}</p>}
      </StubLayout>
    );
  }
  return (
    <StubLayout name={stub.tradeName} id={stub.conceptId}>
      {stub.status === "removed" ? <p>{PUBLIC_NEW.removed.removed}</p> : <>
        <p>{STUB.pending}</p>
        {stub.batchId && <p>{fillNodes(STUB.notNotFound, { batchId: <span className="mono">{stub.batchId}</span> })}</p>}
      </>}
    </StubLayout>
  );
}

/** §6.4: "The same pattern applies to substance stubs: "…hides its codes and interactions…", with no batch sentence." */
export function SubstanceStubView({ stub, mode = "approved_only" }: { stub: SubstanceStub; mode?: PublicMode }) {
  return <StubLayout name={stub.preferredName} id={stub.bdsId}>
    <p>{mode === "show_unreviewed" ? SHOW_COPY.substanceStub : STUB.substancePending}</p></StubLayout>;
}
