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
    expect(NEW_COPY[NEW_COPY_ROWS.qaReference]).toBe(QA_COPY.reference);
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
    // QA API reference (§1.7 note): the reference's short words that other modules already print
    expect([SHARED_WORDS.code, SHARED_WORDS.yes, SHARED_WORDS.no, SHARED_WORDS.endpoints]).toEqual(["Code", "Yes", "No", "Endpoints"]);
    expect([DESK.retryCheck, DESK.openDesk, NAV.signIn]).toEqual(["Retry check", "Open the review desk", "Sign in"]);
    expect(DESK.botError).toBe("We couldn't confirm you're a person. Your decision is kept. Retry the check to continue.");
  });

  it("QA API reference (§5.18 section 3, D72): every request and answer, the endpoint panels, MCP over HTTP", () => {
    expect(QA_COPY.reference).toEqual({
      // 3a "Every request and answer"
      commonHeading: "Every request and answer",
      commonHeader: "Send GET requests with one header, {header}, where {key} is one of your keys. The examples read the key from the INTELLIDRUGS_QA_KEY environment variable, so it stays out of your shell history.",
      envSuccess: "true for a 200 answer, false for every error.",
      envData: "The endpoint's data, shown in each panel below. null on an error.",
      envMessage: "OK, or the error's fixed message.",
      envErrors: "Empty on success. On an error, one entry: field (the input that was refused or not found, or null), code and message.",
      envMetadata: "timestamp (UTC) and requestId. Quote requestId when you report a finding or a problem.",
      errorAnswer: "Error answer",
      exampleNote: "Anything marked {marker} is an illustration, not a stored record. Its field names and shapes are the API's own.",
      headersLine: "Answers are JSON and never cached. A 401 answer has the header {auth}; a 429 answer has {retry}, the seconds to wait.",
      pageLine: "{page} counts from 0. A list answer has {total} and {size}: the last page is {total} divided by {size}, rounded up, minus 1.",
      notFoundLine: "A path that is not one of the five endpoints answers 404 with no field. No QA answer is ever a 500.",
      // 3b "Endpoints"
      endpointsLead: "Open an endpoint to see what to send, an example answer, and the errors it can give.",
      forRequest: " for {request}",
      regionLabel: "{label} for {request}",
      request: "Request",
      requiredHeader: "Required header: {header}.",
      paramsCaption: "Parameters for {request}",
      colParameter: "Parameter",
      colIn: "In",
      colRequired: "Required",
      colRule: "Rule",
      inPath: "Path",
      inQuery: "Query",
      noParams: "This endpoint takes no parameters.",
      otherParams: "Any other query parameter, or one sent twice, is refused with 400.",
      command: "Command",
      response: "Response",
      answer: "Answer",
      keyFields: "Key fields",
      errors: "Errors",
      errorsCaption: "Errors for {request}",
      colWhen: "When",
      colFix: "What to do",
      // parameter rules
      ruleBatchId: "1 to {max} letters, digits, dots, underscores or hyphens ({pattern}), as {source} lists it.",
      ruleConceptId: "1 to {max} characters, with no control characters, exactly as {source} lists it. Percent-encode any character other than a letter, digit, dot, underscore, hyphen or tilde.",
      ruleFilter: "One of {values}. Problem filters, below, says what each one matches.",
      ruleStage: "One of {values}, and only with {only}. With any other filter it is refused.",
      ruleBatch: "A batch id, by the batchId rule ({pattern}). Only that batch's records are listed.",
      ruleBdsId: "BDS- and six digits ({pattern}), as a record's {source} gives it.",
      rulePage: "A whole number from 0 to {max}; 0 when left out. {size} a page.",
      // key fields: batches
      fieldBatchesBatchId: "The id to use in the other endpoints.",
      fieldBatchesStatus: "The batch's state: in_review, approved or rejected.",
      fieldBatchesItemCount: "How many current records the batch holds.",
      fieldBatchesApprovedCount: "How many of them a pharmacist has approved.",
      fieldBatchesRunAt: "When the pipeline last ran the batch, in UTC.",
      // key fields: batch
      fieldBatchConceptId: "The record's DGDA concept id, for the record endpoint.",
      fieldBatchDisplayStatus: "The review state: pending, engineer_checked, approved, issue or back_in_review.",
      fieldBatchStage: "dgda, substances, clinical or ddinter, in pipeline order. A stage with no result is left out.",
      fieldBatchStageStatus: "ok, warn or fail.",
      fieldBatchStageNote: "The pipeline's note for that stage, whole.",
      // key fields: record
      fieldRecordSourceJson: "The DGDA register record exactly as stored. Check the extraction against it.",
      fieldRecordSourceLink: "The register page to cite for the source.",
      fieldRecordStrength: "The parsed strength, with strengthUnit, perValue and perUnit. null means none was found.",
      fieldRecordCodes: "Each code with its system, method, confidence and source link.",
      fieldRecordCoverage: "full, none or not_run. none never means a combination is safe.",
      fieldRecordChosen: "The DDInter entries chosen for the product's route, and whether the route was assumed.",
      fieldRecordRoute: "The route used to choose DDInter entries. Compare routeAssumed with the ddinter stage's evidence.",
      fieldRecordEvidence: "What the pipeline stored for that stage, unchanged.",
      fieldRecordTextMissing: "true where DDInter has no interaction or management text for the pair.",
      fieldRecordOtherPairs: "Pairs with records in other batches. partnerCount counts every partner.",
      fieldRecordHistory: "Runs and decisions, oldest first: role, time and decision only.",
      // key fields: records
      fieldRecordsTotal: "How many current records match.",
      fieldRecordsPage: "This page's index, from 0, with size records a page.",
      fieldRecordsStage: "The stage you sent, or null.",
      fieldRecordsBatch: "The batch you sent, or null.",
      fieldRecordsItems: "The matching records, by batch id, then concept id.",
      fieldRecordsStages: "Each stage's status: ok, warn, fail, or null when the stage has no result.",
      // key fields: pairs
      fieldPairsTotal: "How many stored DDInter pairs link this substance with another substance we hold. 50 a page.",
      fieldPairsEntry: "This substance's DDInter entry in the pair, with its route scope.",
      fieldPairsPartner: "The other substance and its entry. When both sides are this substance, side b.",
      fieldPairsSeverity: "DDInter's severity: major, moderate, minor or unknown.",
      fieldPairsInteraction: "DDInter's interaction text as stored, like management. null when DDInter has none.",
      fieldPairsApplies: "true when a medicine we hold is checked against both entries for its route.",
      fieldPairsReview: "The senior review state and time: not_reviewed, reviewed, changed or issue.",
      fieldPairsChanges: "What changed in DDInter since the review. Only when the state is changed.",
      // errors
      when400: "{field} is the first input refused: {fields}, or a query parameter this endpoint doesn't take, or one sent twice.",
      when400None: "{field} is the query parameter you sent: this endpoint takes none.",
      fix400: "Fix that input by the rule in Parameters, then send again.",
      when401: "The Authorization header is missing or malformed, the key is unknown, expired or revoked, or your account no longer has QA access. The answer never says which.",
      fix401: "Check the header is Authorization: Bearer and your key. In Your keys, check the key is Active; if it isn't, create a new one.",
      when404: "{field} names the id that wasn't found: {fields}.",
      fix404: "Check the id. Ids are case-sensitive: copy them from another answer.",
      when429: "Your key made more than {limit} requests in a minute, counting the API and the MCP server together.",
      fix429: "Wait the seconds in Retry-After, then send again. A plain-text 429 without the envelope is the site's per-address limit: send fewer requests a second.",
      when502: "IntelliDrugs couldn't read the data, or couldn't record the read.",
      fix502: "Try again in a minute. If it keeps failing, report it with metadata.requestId.",
      // 3d "MCP over HTTP"
      mcpHeading: "MCP over HTTP",
      mcpLead: "The MCP server address takes the same keys and returns the same data over JSON-RPC 2.0. Your AI client sends these requests for you; use this to test the server from a script.",
      mcpReturns: "JSON-RPC 2.0 for AI clients and scripts: initialize, then list and call the five tools.",
      headersCaption: "Headers for {request}",
      colHeader: "Header",
      colValue: "Value",
      acceptLine: "Accept may be left out; if you send it, it must allow application/json.",
      versionLine: "Send MCP-Protocol-Version on every request after initialize, with the version initialize returned. Without it the server assumes {default}. Supported versions: {versions}.",
      bodyLine: "Send one JSON-RPC 2.0 message per request, at most {max} KiB, and get one JSON answer. A batch (a JSON array) is refused. The server answers {methods}; a notification gets 202 with no body. It keeps no session between requests.",
      initializeHeading: "Initialize",
      initializeLead: "Ask for a protocol version. The answer gives the version to send in MCP-Protocol-Version, the server's name and version, and the rules as instructions.",
      callHeading: "Call a tool",
      callLead: "The result has two text blocks: the rules, then the answer of the matching endpoint as indented JSON, here the same envelope as {path}. Parse the second block's text as JSON.",
      toolsHeading: "Tools",
      toolsCaption: "MCP tools",
      colTool: "Tool",
      colArguments: "Arguments",
      colSameData: "Same data as",
      argRequired: " required",
      argOptional: " optional",
      noArguments: "No arguments.",
      argsLine: "Arguments follow the rules in each endpoint's Parameters. {page} is a JSON integer, not text. A tool refuses any argument it doesn't list, and a {batchId}, {batch} or {conceptId} of {dot} or {dotdot}.",
      colRpcCode: "JSON-RPC code",
      colMessage: "Message",
      mcpFix405: "Send POST.",
      mcpFix403: "Leave out Origin, or send this site's own address.",
      mcpFix502: "Your key couldn't be checked. Try again in a minute.",
      mcpFix415: "Send Content-Type: application/json.",
      mcpFix406: "Leave out Accept, or allow application/json in it.",
      mcpFix413: "Keep the body under {max} KiB.",
      mcpFixParse: "Send one JSON value in UTF-8.",
      mcpFixInvalidRequest: 'Send one object with jsonrpc "2.0", a method, and a string or number id. Never an array.',
      mcpFixVersion: "Send a supported MCP-Protocol-Version, or leave it out.",
      mcpFixParams: "initialize needs params.protocolVersion; tools/call needs params.name, and arguments must be an object.",
      mcpFixMethod: "Use initialize, ping, tools/list or tools/call.",
      mcpFixInternal: "Try again. If it keeps failing, tell the IntelliDrugs team when it happened.",
      mcpFixInput: "Fix that argument by the rule of the endpoint's parameter.",
      mcpFixUnknownTool: "Use a tool name from tools/list.",
      mcpFixQaError: "See that status in the endpoint's Errors table.",
    });
  });
});
