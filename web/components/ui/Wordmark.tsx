import styles from "./Wordmark.module.css";

/** The wordmark sizes Boards DS, P and R draw. */
export type WordmarkSize = 13 | 16 | 17 | 19 | 20 | 28;
const SIZE: Record<WordmarkSize, string> = { 13: styles.s13, 16: styles.s16, 17: styles.s17, 19: styles.s19, 20: styles.s20, 28: styles.s28 };

/** §3.4 Wordmark: "IntelliDrugs" + cobalt stop (aria-hidden). Size is set with font-size only, through a class. */
export default function Wordmark({ size, sub }: { size: WordmarkSize; sub?: "Review" | "Learn" }) {
  return (
    <span className={`wordmark ${SIZE[size]}`}>
      IntelliDrugs<span className="wordmark-dot" aria-hidden="true">.</span>
      {sub && <><span className="sr-only"> </span><span className="wordmark-sub">{sub}</span></>}
    </span>
  );
}
