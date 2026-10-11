import Turnstile from "@/components/Turnstile";
import type { FlagTarget } from "@/lib/api";
import { FLAG_MESSAGE_MAX, FLAG_MESSAGE_MIN } from "@/lib/actions-core";
import type { Session } from "@/lib/session";
import { flagAction } from "@/lib/review-actions";

/** Fixed messages for the flag action's outcome codes; anything else in the URL is ignored. */
const OUTCOME: Record<string, string> = {
  sent: "Thank you. Your flag was sent to the reviewers.",
  forbidden: "Sign in to flag a problem.",
  captcha: "The verification check failed. Please try again.",
  invalid: `A flag needs a message of ${FLAG_MESSAGE_MIN} to ${FLAG_MESSAGE_MAX} characters.`,
  failed: "The flag could not be sent. Please try again.",
};

/**
 * "Flag a problem" for any signed-in visitor (role user included). A plain server-action <form>: works without JS.
 * The action re-checks the session, the message length and Turnstile; the email comes from the session, never the form.
 */
export default function FlagForm({ session, targetType, targetId, outcome }:
    { session: Session | null; targetType: FlagTarget; targetId: string; outcome?: string }) {
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
          <Turnstile />
          <button type="submit">Send flag</button>
        </form>
      </details>
    </section>
  );
}
