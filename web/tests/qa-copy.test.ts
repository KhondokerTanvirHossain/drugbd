import { describe, expect, it } from "vitest";
import { NEW_COPY, NEW_COPY_ROWS, QA_COPY } from "@/lib/copy";

describe("the QA portal rows of §1.7, verbatim", () => {
  it("each QA portal row is a NEW_COPY entry, and QA_COPY is the same object", () => {
    expect(NEW_COPY[NEW_COPY_ROWS.qaRole]).toBe(QA_COPY.role);
    expect(NEW_COPY[NEW_COPY_ROWS.qaAccount]).toBe(QA_COPY.account);
    expect(NEW_COPY[NEW_COPY_ROWS.qaPage]).toBeDefined();
    expect(NEW_COPY[NEW_COPY_ROWS.qaKeys]).toBeDefined();
  });

  it("QA role (§5.1, §5.13, §6.2): badge, menu item, welcome state and invite", () => {
    expect(QA_COPY.role).toEqual({
      badge: "QA",
      qaTools: "QA tools",
      welcomeHeading: "You have QA access",
      welcomeStepKey: "Create a key on the QA tools page. It is shown once, so copy it then.",
      welcomeStepConnect: "Connect Claude Code, Cursor or a script with the key. What it reads may not be reviewed yet, and it can't change anything.",
      welcomeStepNoReview: "QA accounts don't review records. Reviewing needs a reviewer invite.",
      openQaTools: "Open QA tools",
      invite: "Role: QA. You read IntelliDrugs data for quality checks through QA tools: your own keys, the MCP server and the QA API. You can't review or publish records. Sign in at drugdb.eliooo.org with this Google account.",
    });
  });

  it("QA account on a review page (§5.12)", () => {
    expect(QA_COPY.account).toEqual({
      title: "Your account has QA access, not reviewer access.",
      body: "QA accounts read data through QA tools. Reviewing records needs a reviewer invite.",
      openQaTools: "Open QA tools",
    });
  });
});
