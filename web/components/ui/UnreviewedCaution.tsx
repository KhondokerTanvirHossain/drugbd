import { UNREVIEWED_CAUTION } from "@/lib/copy";
import Banner from "./Banner";

/**
 * §3.4 UnreviewedCaution (D74): the warn Banner with UNREVIEWED_CAUTION as its only sentence, role="note", not a live
 * region. At most one per page, first in <main>, on a public page that renders a record that is not approved (§6.10).
 */
export default function UnreviewedCaution() {
  return <Banner tone="warn" title={UNREVIEWED_CAUTION} role="note" />;
}
