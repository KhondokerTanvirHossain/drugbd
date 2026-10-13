import styles from "./Header.module.css";
import { ROLE_LABEL } from "@/lib/reviewers";
import type { Session } from "@/lib/session";

/** Site header. A signed-in visitor sees their role only, never their email (Global Constraints). */
export default function Header({ session }: { session: Session | null }) {
  return (
    <header>
      <a href="/"><strong>BDDrug KB</strong></a> <a href="/batches">Batches</a> <a href="/check">Check</a>{" "}
      <small>preview: data may be incomplete</small>{" "}
      {session ? (
        <span>
          {session.role !== "user" && <><a href="/flags">Flags</a>{" "}</>}
          <small>Signed in as {ROLE_LABEL[session.role]}</small>{" "}
          <form method="post" action="/signout" className={styles.inlineForm}><button type="submit">Sign out</button></form>
        </span>
      ) : (
        <a href="/signin">Reviewer sign-in</a>
      )}
    </header>
  );
}
