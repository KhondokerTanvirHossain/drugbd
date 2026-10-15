import type { LearnContext } from "@/components/learn/context";
import styles from "@/components/learn/learn.module.css";
import { Chapter, Section } from "@/components/learn/parts";
import Kbd from "@/components/ui/Kbd";
import { PILOT_IDS } from "@/content/learn/pilot-snapshot";
import { LEARN_BOARD, NOT_REVIEWED, NO_DATA_SENTENCE, STALE_TITLE } from "@/lib/copy";

/**
 * Chapter 10 "FAQ" (Board L; §1.6 items 14 and 16). Native <details> (§6.8). The Napa answer says no pilot record is
 * approved, so it renders only while /v1/stats reports every pilot record as not reviewed (§6.8 "Approval-state
 * sentences"; an unreported record says nothing); the first question shown is the open one. The Napa and Domperidone
 * answers about names and coverage are Board L's generic examples, outside any snapshot block.
 */
export default function FaqChapter({ ctx }: { ctx: LearnContext }) {
  const napaQuestion = ctx.batch !== null && ctx.batch.approved === 0 && PILOT_IDS.every((id) => ctx.item(id)?.status === "not_reviewed");
  return (
    <Chapter slug="faq" level={1}>
      <Section id="faq-list" h={2}>
        <div className={styles.faq}>
          {napaQuestion && <details open><summary>Why can't I see Napa on the public site?</summary><div className={styles.answer}><p>No pharmacist has approved it yet. Every pilot record is <b>{NOT_REVIEWED}</b>, so public pages and the public API show the name and that status, and nothing else.</p></div></details>}
          <details open={!napaQuestion}><summary>No alerts came back. Is the combination safe?</summary><div className={styles.answer}><p>Not necessarily. No alert means DDInter 2.0 records no interaction for those pairs. Check that no product is listed under not reviewed and no substance under no data; those pairs were not checked at all.</p></div></details>
          <details><summary>Why does Domperidone show no interaction data?</summary><div className={styles.answer}><p>Domperidone has no DDInter 2.0 entry (coverage: none). We show: <b>{NO_DATA_SENTENCE}</b></p></div></details>
          <details><summary>Why does Napa say Acetaminophen, not Paracetamol?</summary><div className={styles.answer}><p>DGDA's ICD-11 mapping and DDInter both name the substance Acetaminophen. Paracetamol is kept as a synonym, so searching either name finds Napa.</p></div></details>
          <details><summary>Can an engineer publish a record?</summary><div className={styles.answer}><p>No. An engineer's "Looks correct" is recorded as <b>Engineer checked</b> and the record stays hidden. Only a pharmacist's approval publishes.</p></div></details>
          <details><summary>What if the record changes while I am reviewing it?</summary><div className={styles.answer}><p>The page shows <b>{STALE_TITLE}</b> and pauses decisions. A decision sent from the old page is refused, so you never approve data you did not see.</p></div></details>
          <details><summary>I pressed "Looks correct" by mistake.</summary><div className={styles.answer}><p>Press <Kbd keys="U" /> or Undo before the undo window closes {LEARN_BOARD.undoWindowFaq}. Nothing is saved or published until the window closes.</p></div></details>
          <details><summary>How do I become a reviewer?</summary><div className={styles.answer}><p>Anyone can read approved records without signing in, and anyone can sign in with Google to report a problem. Reviewer roles are by invitation from the IntelliDrugs team.</p></div></details>
          <details><summary>Is my email shown to anyone?</summary><div className={styles.answer}><p>No. Reviewer and reporter emails are stored for the team only. Decision history is served only to signed-in reviewers; public pages and the public API never show an email.</p></div></details>
          <details><summary>Can my company use the API today?</summary><div className={styles.answer}><p>Not yet directly. The API runs behind the website for now. Partner keys, metering and monthly releases are planned.</p></div></details>
        </div>
      </Section>
    </Chapter>
  );
}
