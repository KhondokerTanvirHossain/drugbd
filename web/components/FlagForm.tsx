import Turnstile from "@/components/Turnstile";
import type { FlagTarget } from "@/lib/api";
import { FLAG_MESSAGE_MAX, FLAG_MESSAGE_MIN } from "@/lib/actions-core";
import type { Session } from "@/lib/session";
import { flagAction } from "@/lib/review-actions";
import { FLAG_OUTCOME as OUTCOME } from "@/components/public/ReportProblem";

/**
 * "Flag a problem" for any signed-in visitor (role user included). A plain server-action <form>: works without JS.
 * The action re-checks the session, the message length and Turnstile; the email comes from the session, never the form.
 */
export default function FlagForm({ session, targetType, targetId, outcome, nonce }:
    { session: Session | null; targetType: FlagTarget; targetId: string; outcome?: string; nonce?: string }) {
  const message = outcome ? OUTCOME[outcome] : undefined;
  if (!session) return message && outcome === "forbidden" ? <p id="flag" role="alert">{message}</p> : null;
  return (
    <section id="flag">
      {message && <p role={outcome === "sent" ? "status" : "alert"}>{message}</p>}
      <details>
        <summary>Flag a problem</summary>
        <form action={flagAction}>
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <label>
            What is wrong? ({FLAG_MESSAGE_MIN} to {FLAG_MESSAGE_MAX} characters)
            <br />
            <textarea name="message" required minLength={FLAG_MESSAGE_MIN} maxLength={FLAG_MESSAGE_MAX} rows={4} cols={60} />
          </label>
          <Turnstile action="flag" nonce={nonce} />
          <button type="submit">Send flag</button>
        </form>
      </details>
    </section>
  );
}
