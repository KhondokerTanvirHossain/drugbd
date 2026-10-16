import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import { NO_PHI_HELP } from "@/lib/copy";

describe("/privacy (§9.7)", () => {
  const html = renderToStaticMarkup(<PrivacyPage />);
  it("states the sign-in card's privacy text, the audit trail and the no-PHI sentence", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(">Privacy</h1>");
    expect(html).toContain("We use your Google name and email address only to sign you in and, for reviewers, to record each decision.");
    expect(html).toContain("Each reviewer decision and sign-in is recorded with the account and time, for the team&#x27;s audit trail. These records are never public.");
    expect(html).toContain("in notes, reports or requests. We don&#x27;t ask for patient information.");
    expect(html.replace(/&#x27;/g, "'")).toContain(NO_PHI_HELP.slice(0, -1));
  });
});
