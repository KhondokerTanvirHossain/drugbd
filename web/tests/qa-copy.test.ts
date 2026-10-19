import { describe, expect, it } from "vitest";
import { NEW_COPY, NEW_COPY_ROWS, QA_COPY } from "@/lib/copy";
import { NAV } from "@/lib/public-copy";
import { DESK, SHARED_WORDS } from "@/lib/review-copy";

describe("the QA portal rows of §1.7, verbatim", () => {
  it("each QA portal row is a NEW_COPY entry, and QA_COPY is the same object", () => {
    expect(NEW_COPY[NEW_COPY_ROWS.qaRole]).toBe(QA_COPY.role);
    expect(NEW_COPY[NEW_COPY_ROWS.qaAccount]).toBe(QA_COPY.account);
    expect(NEW_COPY[NEW_COPY_ROWS.qaPage]).toBe(QA_COPY.page);
    expect(NEW_COPY[NEW_COPY_ROWS.qaKeys]).toBe(QA_COPY.keys);
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

  it("QA tools page (§5.18): heading, Connect your AI, API, Rules, copy buttons, the pharmacist banner", () => {
    expect(QA_COPY.page).toEqual({
      heading: "QA tools",
      sub: "Read IntelliDrugs data for quality checks from your AI assistant or a script. Everything here is read-only.",
      connectHeading: "Connect your AI",
      connectLead: "The QA MCP server runs on this site. Add it to your AI client with this address, and send one of your keys as a Bearer token.",
      mcpAddressLabel: "MCP server address",
      copyAddress: "Copy address",
      claudeCodeHeading: "Claude Code",
      copyCommand: "Copy command",
      claudeCodeHelp: "Set INTELLIDRUGS_QA_KEY to your key first. Claude Code saves the header in your own settings. Never add it with --scope project, which writes the key into the project's files.",
      cursorHeading: "Cursor and other clients",
      copyConfiguration: "Copy configuration",
      cursorHelp: "Replace YOUR_KEY with your key. Keep this file out of version control.",
      oauthHeading: "claude.ai and ChatGPT",
      oauthBody: "Their connectors sign in with OAuth, which IntelliDrugs does not offer. Use Claude Code, Cursor or another client that can send an Authorization header.",
      toolsLine: "The server has five read-only tools: {t1}, {t2}, {t3}, {t4} and {t5}. A local version that runs on your computer is in {path}.",
      apiHeading: "API",
      apiLead: "The same data over HTTPS, for scripts. Send your key in the Authorization header. Each key may make 60 requests a minute, shared with the MCP server.",
      apiBaseLabel: "API base address",
      endpointsCaption: "QA API endpoints",
      colRequest: "Request",
      colReturns: "Returns",
      returnsBatches: "Every batch, with its status and counts.",
      returnsBatch: "One batch's current records, with each pipeline stage's result.",
      returnsRecord: "One record in full: DGDA source, extraction, codes with source links, stages, pairs and decision history.",
      returnsRecords: "Records with a problem, 100 a page. Optional: stage (with stage_warn only), batch and page.",
      returnsPairs: "One substance's DDInter pairs, 50 a page. Optional: page.",
      filtersHeading: "Problem filters",
      filterStrengthMissing: "A parsed ingredient has no strength.",
      filterParsePartial: "The generic content was parsed only in part.",
      filterRouteAssumed: "The pipeline assumed the DDInter route.",
      filterNoDdinterData: 'A substance has DDInter coverage "none". This never means a combination is safe.',
      filterUnaligned: "An ingredient has no substance.",
      filterStageWarn: "A pipeline stage warns. Add stage to name one: dgda, substances, clinical or ddinter.",
      filterStageFail: "A pipeline stage failed.",
      copyExample: "Copy example",
      envelopeLine: "Every answer uses the same envelope: success, data, message, errors and metadata. Quote metadata.requestId with each finding, so the team can find the exact read.",
      rulesHeading: "Rules",
      rulesLead: "Every answer from the MCP server starts with these rules. Follow them in every report.",
      rulesKeys: "Use only your own keys. Never paste a key into a chat, a ticket or a file under version control. If a key may have leaked, revoke it at once.",
      copied: "Copied.",
      copyFailed: "Couldn't copy. The text is selected; press Ctrl C (Cmd C on Mac) to copy it.",
      pharmacistTitle: "QA tools are for QA team members, engineers and senior pharmacists.",
      pharmacistBody: "Your account reviews batches. Ask the IntelliDrugs team if you need QA access.",
    });
  });

  it("QA keys (§5.18): form, panel, list, revoke and every outcome", () => {
    expect(QA_COPY.keys).toEqual({
      heading: "Your keys",
      lead: "A key lets a client read QA data on your behalf. It expires 90 days after you create it, and you can revoke it at any time. You can have up to 5 active keys.",
      nameLabel: "Key name",
      nameCounter: "{n} of 40",
      nameHelp: "1–40 characters, for example the laptop or tool that will use it.",
      nameError: "Name the key with 1–40 characters.",
      create: "Create key",
      creating: "Creating",
      activeLimitHelp: "You have 5 active keys. Revoke one to create another.",
      noScript: "Creating and revoking keys needs JavaScript for the bot check.",
      panelHeading: "Copy your new key now",
      panelBody: "This is the only time it is shown. IntelliDrugs keeps only a fingerprint of it and can't show it again.",
      panelLabel: "Key {name}",
      copyKey: "Copy key",
      saved: "I've saved it",
      createdAnnounce: "Key {name} created. Copy it now; it is shown only once.",
      activeLimitTitle: "You already have 5 active keys.",
      activeLimitBody: "No key was created. Revoke one, then create another.",
      dailyLimitTitle: "You've created 10 keys in the last 24 hours.",
      dailyLimitBody: "No key was created. Try again tomorrow.",
      captchaTitle: "We couldn't confirm you're a person.",
      captchaCreateBody: "No key was created. Retry the check, then try again.",
      captchaRevokeBody: "No key was revoked. Retry the check, then try again.",
      forbiddenTitle: "Your account no longer has QA access.",
      forbiddenCreateBody: "No key was created. Ask the IntelliDrugs team if you need QA access.",
      forbiddenRevokeBody: "No key was revoked. Ask the IntelliDrugs team if you need QA access.",
      unauthenticatedTitle: "Your sign-in expired.",
      unauthenticatedCreateBody: "No key was created. Sign in again to continue.",
      unauthenticatedRevokeBody: "No key was revoked. Sign in again to continue.",
      createFailedTitle: "Couldn't create the key.",
      createFailedBody: "If a new key appears in your list, revoke it: it can't be shown again. Check your connection and try again.",
      tryAgain: "Try again",
      listLabel: "Your QA keys",
      colCreated: "Created",
      colExpires: "Expires",
      colLastUsed: "Last used",
      never: "Never",
      statusActive: "Active",
      statusExpired: "Expired",
      statusRevoked: "Revoked",
      revoke: "Revoke",
      revokeSr: " key {name}",
      empty: "You have no keys yet.",
      confirm: "Revoke {name}? Clients using it stop working at once.",
      revokeKey: "Revoke key",
      revoking: "Revoking",
      cancel: "Cancel",
      revokedAnnounce: "Key {name} revoked.",
      alreadyRevoked: "Key {name} was already revoked.",
      notFoundTitle: "That key isn't in your list any more.",
      notFoundBody: "Nothing was changed. Reload the page.",
      rateLimitedTitle: "Too many changes to your keys.",
      rateLimitedBody: "Nothing was changed. Wait a few minutes and try again.",
      revokeFailedTitle: "Couldn't revoke the key.",
      revokeFailedBody: "It still works. Check your connection and try again.",
      loadErrorTitle: "Couldn't load your keys.",
      loadErrorBody: "Nothing was changed. Check your connection and try again.",
    });
  });

  it("the words other modules already print come from their shared homes", () => {
    expect([SHARED_WORDS.name, SHARED_WORDS.status, SHARED_WORDS.actions, SHARED_WORDS.example, SHARED_WORDS.reload])
      .toEqual(["Name", "Status", "Actions", "Example", "Reload"]);
    expect([DESK.retryCheck, DESK.openDesk, NAV.signIn]).toEqual(["Retry check", "Open the review desk", "Sign in"]);
    expect(DESK.botError).toBe("We couldn't confirm you're a person. Your decision is kept. Retry the check to continue.");
  });
});
