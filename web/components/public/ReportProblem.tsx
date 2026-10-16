import TurnstileField from "@/components/TurnstileField";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import { FLAG_MESSAGE_MAX, FLAG_MESSAGE_MIN } from "@/lib/actions-core";
import { NO_PHI_HELP, PUBLIC_NEW } from "@/lib/copy";
import { PRODUCT } from "@/lib/public-copy";
import { DESK } from "@/lib/review-copy";
import { flagAction } from "@/lib/review-actions";
import type { Session } from "@/lib/session";

/** FlagForm's outcome messages, unchanged (§6.5: "Outcome messages are the existing FlagForm map"). Anything else is ignored. */
export const FLAG_OUTCOME: Record<string, string> = {
  sent: "Thank you. Your flag was sent to the reviewers.",
  forbidden: "Sign in to flag a problem.",
  captcha: "The verification check failed. Please try again.",
  invalid: `A flag needs a message of ${FLAG_MESSAGE_MIN} to ${FLAG_MESSAGE_MAX} characters.`,
  failed: "The flag could not be sent. Please try again.",
};
const TURNSTILE_OFF = "Verification is not configured, so this action is disabled.";

/**
 * §6.5 "Report a problem": a <details>; signed in, the labelled field (5–2000 characters, NO_PHI_HELP), the bot check
 * (action flag) and "Send report"; anonymous, a sign-in link back to this page. The email comes from the session in the
 * server action, never from the form. The outcome and the disabled-verification notice are plain text with no role:
 * §10.2 allows one polite, sr-only live region per page and no assertive ones, and this page has no island to own it.
 */
export default function ReportProblem({ conceptId, session, outcome, siteKey, nonce }:
    { conceptId: string; session: Session | null; outcome?: string; siteKey: string | null; nonce?: string }) {
  const message = outcome ? FLAG_OUTCOME[outcome] : undefined;
  return (
    <div id="flag">
      {message && <p>{message}</p>}
      <details open={outcome !== undefined && outcome !== "sent" ? true : undefined}>
        <summary>{PRODUCT.report}</summary>
        {session ? (
          <form action={flagAction}>
            <input type="hidden" name="targetType" value="product" />
            <input type="hidden" name="targetId" value={conceptId} />
            <Field id="report-message" label={PUBLIC_NEW.productPage.reportLabel}
              control={<textarea className="textarea" name="message" required minLength={FLAG_MESSAGE_MIN} maxLength={FLAG_MESSAGE_MAX} rows={4} />}
              help={`${PUBLIC_NEW.productPage.reportHelp} ${NO_PHI_HELP}`} />
            {siteKey ? <TurnstileField siteKey={siteKey} action="flag" nonce={nonce} /> : <p>{TURNSTILE_OFF}</p>}
            <Button variant="primary" type="submit">{DESK.sendReport}</Button>
          </form>
        ) : (
          <p><a href={`/signin?${new URLSearchParams({ returnTo: `/products/${conceptId}` })}`}>{PUBLIC_NEW.productPage.signInToReport}</a></p>
        )}
      </details>
    </div>
  );
}
