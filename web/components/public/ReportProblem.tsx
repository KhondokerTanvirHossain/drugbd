import TurnstileField from "@/components/TurnstileField";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import { FLAG_MESSAGE_MAX, FLAG_MESSAGE_MIN } from "@/lib/actions-core";
import { NO_PHI_HELP, PUBLIC_NEW } from "@/lib/copy";
import { PRODUCT } from "@/lib/public-copy";
import { DESK } from "@/lib/review-copy";
import type { Session } from "@/lib/session";

/** FlagForm's outcome messages, unchanged (§6.5: "Outcome messages are the existing FlagForm map"). Anything else is ignored. */
export const FLAG_OUTCOME: Record<string, string> = {
  sent: "Thank you. Your flag was sent to the reviewers.",
  forbidden: "Sign in to flag a problem.",
  captcha: "The verification check failed. Please try again.",
  invalid: `A flag needs a message of ${FLAG_MESSAGE_MIN} to ${FLAG_MESSAGE_MAX} characters.`,
  failed: "The flag could not be sent. Please try again.",
};
/** Shown in place of the bot check when Turnstile is not configured; the server action then fails closed. */
export const TURNSTILE_OFF = "Verification is not configured, so this action is disabled.";

/**
 * §6.5 "Report a problem": a <details>; signed in, the labelled field (5–2000 characters, NO_PHI_HELP), the bot check
 * (action flag) and "Send report"; anonymous, a sign-in link back to this page. The email comes from the session in the
 * route handler, never from the form. The outcome and the disabled-verification notice are plain text with no role:
 * §10.2 allows one polite, sr-only live region per page and no assertive ones, and this page has no island to own it. So
 * the form posts natively to /flag, whose 303 to ?flag=<code>#flag is a full navigation with or without JavaScript: the
 * browser keeps the fragment and lands on the outcome (lib/form-post.ts).
 */
export default function ReportProblem({ conceptId, session, outcome, siteKey, nonce }:
    { conceptId: string; session: Session | null; outcome?: string; siteKey: string | null; nonce?: string }) {
  // Own keys only: "constructor" or "toString" is no outcome, never Object.prototype's function.
  const message = outcome && Object.hasOwn(FLAG_OUTCOME, outcome) ? FLAG_OUTCOME[outcome] : undefined;
  return (
    <div id="flag">
      {message && <p>{message}</p>}
      <details open={outcome !== undefined && outcome !== "sent" ? true : undefined}>
        <summary>{PRODUCT.report}</summary>
        {session ? (
          <form method="post" action="/flag">
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
