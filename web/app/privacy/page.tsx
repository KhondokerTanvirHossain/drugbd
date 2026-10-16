import { PUBLIC_NEW } from "@/lib/copy";
import { NAV, SIGNIN_CARD } from "@/lib/public-copy";
export const metadata = { title: "Privacy · IntelliDrugs" };

/** §9.7: "in the words of the sign-in card plus the audit-trail paragraph", and the no-PHI sentence. No data is read. */
export default function PrivacyPage() {
  return (
    <article>
      <h1>{NAV.privacy}</h1>
      <p>{SIGNIN_CARD.privacy}</p>
      <p>{PUBLIC_NEW.privacy.audit}</p>
      <p>{PUBLIC_NEW.privacy.noPhi}</p>
    </article>
  );
}
