import styles from "./BotCheck.module.css";

export type BotCheckState = "passed" | "checking" | "failed";
const WORD: Record<BotCheckState, string> = { passed: "Bot check passed", checking: "Checking", failed: "Bot check failed" };
/** §3.4 BotCheck: inline text only. */
export default function BotCheck({ state }: { state: BotCheckState }) {
  return <span className={state === "failed" ? `botcheck is-failed ${styles.failed}` : "botcheck"}>{WORD[state]}</span>;
}
