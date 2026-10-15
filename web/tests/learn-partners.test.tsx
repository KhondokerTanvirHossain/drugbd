import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { learnContext } from "@/components/learn/context";
import { P } from "@/content/learn/pilot-snapshot";
import PartnersChapter, {
  CHECK_PUBLIC, CHECK_REQUEST, CHECK_REVIEWER, ENDPOINTS, PLANNED, PRODUCT_PUBLIC, PRODUCT_REVIEWER,
} from "@/content/learn/partners";
import { NOT_REVIEWED } from "@/lib/copy";
import { pilotStats } from "./fixtures/learn-stats";

const render = (stats = pilotStats(), apiStub = false) => renderToStaticMarkup(<PartnersChapter ctx={learnContext(stats, apiStub)} />);
const decode = (h: string) => h.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const html = render();
const text = decode(html);
const keys = (o: object) => Object.keys(o).sort();
const NAPA_CAPTION = 'Napa is not approved yet, so a public caller gets its id, trade name and status "not_reviewed", with <span class="mono">hidden: true</span>.';

/** Every `@GetMapping`/`@PostMapping` of the API controllers, as "METHOD /path" with path variables written `{}`. */
function controllerRoutes(): string[] {
  const dir = fileURLToPath(new URL("../../api/src/main/java/com/niramoy/bddrug/presentation/", import.meta.url));
  return readdirSync(dir).filter((f) => f.endsWith("Controller.java")).flatMap((f) => {
    const src = readFileSync(join(dir, f), "utf8");
    const base = /@RequestMapping\("([^"]+)"\)/.exec(src)?.[1] ?? "";
    return [...src.matchAll(/@(Get|Post)Mapping(?:\("([^"]*)"\))?/g)].map((m) => `${m[1].toUpperCase()} ${base}${m[2] ?? ""}`);
  }).map((r) => r.replace(/\{[^}]+\}/g, "{}")).sort();
}
const tableRoutes = () => ENDPOINTS.map((e) => `${e.method} ${e.path.split("?")[0].replace(/\{[^}]+\}/g, "{}")}`).sort();

describe("chapter 8: the endpoint table comes from the API controllers (§6.8)", () => {
  it("lists exactly the controllers' mappings, /v1/stats included", () => {
    expect(tableRoutes()).toEqual(controllerRoutes());
    expect(tableRoutes()).toContain("GET /v1/stats");
  });

  it("access matches §2.2: batch evidence and /v1/review/* are Reviewer, writes are Token, stats are Public", () => {
    for (const e of ENDPOINTS) {
      if (e.path.startsWith("/v1/review/") || (e.method === "GET" && e.path.startsWith("/v1/batches"))) expect(e.access).toEqual(["Reviewer"]);
      if (e.method === "POST" && !e.path.startsWith("/v1/interactions")) expect(e.access).toEqual(["Token"]);
    }
    expect(ENDPOINTS.find((e) => e.path === "/v1/stats")!.access).toEqual(["Public"]);
  });

  it("the access legend's All row is §1.6 item 13's", () => {
    expect(text).toContain('<dt>All</dt><dd><span class="mono">scope=all</span> with the internal token, used only by integration tests. Reviewers read unreviewed data through <span class="mono">/v1/review/*</span>.</dd>');
    expect(text).not.toContain("Reviewers see everything this way");
  });

  it("decision history is described as the controller serves it: token only, with emails (§7.1 A2, §1.6 item 16)", () => {
    const history = ENDPOINTS.find((e) => e.method === "GET" && e.path === "/v1/batches/{b}/items/{c}/decisions")!;
    expect(history.what).toBe("Decision history, newest first, with notes, roles and reviewer emails. Internal token only.");
    expect(ENDPOINTS.filter((e) => /never emails/i.test(e.what))).toEqual([]);
    expect(text).toContain("is readable only by signed-in reviewers. Reviewer emails are never shown on public pages or in public API answers.");
    expect(text).not.toContain("It never includes emails.");
  });

  it("the planned endpoints are not served by any controller yet", () => {
    expect(PLANNED).toEqual(["/v1/search", "/v1/substances/{bdsId}/interactions", "/v1/releases"]);
    for (const p of PLANNED) expect(controllerRoutes()).not.toContain(`GET ${p.replace(/\{[^}]+\}/g, "{}")}`);
    expect(text).toContain('Planned endpoints: <span class="mono">/v1/search</span>, <span class="mono">/v1/substances/{bdsId}/interactions</span>, <span class="mono">/v1/releases</span>.');
  });
});

describe("chapter 8: both example bodies match the §7.4 shapes (§11.2)", () => {
  it("the public product is the hidden stub: id, trade name, status, batch, hidden; never reviewStatus", () => {
    expect(keys(PRODUCT_PUBLIC.data)).toEqual(["batchId", "conceptId", "hidden", "status", "tradeName"]);
    expect(PRODUCT_PUBLIC.data).toMatchObject({ status: "not_reviewed", hidden: true, batchId: "0001-pilot" });
    expect(PRODUCT_REVIEWER.data).not.toHaveProperty("reviewStatus");
    expect(html).not.toContain("reviewStatus");
  });

  it("the check bodies carry every §7.4 CheckResult field; notReviewed[] items carry tradeName", () => {
    const top = ["alerts", "duplicates", "noData", "noInteraction", "notChecked", "notReviewed", "products", "summary"];
    const summary = ["alertPairs", "bySeverity", "checkedPairs", "medicines", "noInteractionPairs", "notCheckedPairs", "notReviewed", "totalPairs"];
    for (const body of [CHECK_PUBLIC, CHECK_REVIEWER]) {
      expect(keys(body.data)).toEqual(top);
      expect(keys(body.data.summary)).toEqual(summary);
      expect(keys(body.data.summary.bySeverity)).toEqual(["major", "minor", "moderate", "unknown"]);
      expect(body.data.summary.medicines).toBe(CHECK_REQUEST.conceptIds.length);
    }
    for (const n of CHECK_PUBLIC.data.notReviewed) expect(keys(n)).toEqual(["conceptId", "tradeName"]);
    expect(CHECK_PUBLIC.data.summary.notReviewed).toBe(3);
  });

  it("the reviewer check: alert sides, chosen entries, not-checked reasons and counts are consistent", () => {
    const d = CHECK_REVIEWER.data;
    const [alert] = d.alerts;
    expect(keys(alert)).toEqual(["a", "actions", "b", "ddinterA", "ddinterB", "interaction", "interactionId", "management", "routeAssumed", "severity", "source"]);
    for (const s of [alert.a, alert.b, ...d.notChecked.flatMap((n) => [n.a, n.b])]) expect(keys(s)).toEqual(["bdsId", "conceptId", "name", "routeScope", "tradeName"]);
    for (const p of d.products) for (const s of p.substances) {
      expect(keys(s)).toEqual(["bdsId", "coverage", "ddinter", "name"]);
      for (const r of s.ddinter) expect(keys(r)).toEqual(["ddinterId", "name", "routeAssumed", "routeScope"]);
    }
    for (const n of d.notChecked) expect(["no_data", "not_run", "no_route", "unmapped", "same_product"]).toContain(n.reason);
    expect(d.summary.alertPairs).toBe(d.alerts.length);
    expect(d.summary.notCheckedPairs).toBe(d.notChecked.length);
    expect(d.summary.totalPairs).toBe(d.summary.checkedPairs + d.summary.notCheckedPairs);
    expect(alert.interaction).toMatch(/^Aspirin, even in small doses, .+ lesions\. …$/);
  });

  it("prints each body as indented JSON, with the §1.6 item 13 caption once the API serves the §7.4 stub", () => {
    for (const body of [PRODUCT_PUBLIC, PRODUCT_REVIEWER, CHECK_REQUEST, CHECK_PUBLIC, CHECK_REVIEWER]) expect(text).toContain(JSON.stringify(body, null, 2));
    expect(text).not.toContain("a public caller gets its id");
    expect(decode(render(pilotStats(), true))).toContain(`${NAPA_CAPTION} Show "${NOT_REVIEWED}". Never show "not found".`);
    expect(text).toContain('<code>hidden: true</code>, <code>status "not_reviewed"</code> or <code>"removed"</code>');
  });

  it("the public captions only while they are true (Review Focus 5)", () => {
    expect(text).toContain("None of the three is approved, so a public check lists all three");
    const napa = decode(render(pilotStats({ approved: [P.napa] }), true));
    expect(napa).not.toContain("Napa is not approved yet");
    expect(napa).toContain("None of the three is approved");
    const one = decode(render(pilotStats({ approved: [P.aspirin] })));
    expect(one).not.toContain("None of the three is approved");
  });

  it("no approval-state caption from a fallback: a record /v1/stats does not report says nothing (§6.8)", () => {
    const gone = decode(render(pilotStats({ batchId: "0002-other" }), true));
    expect(gone).not.toContain("Napa is not approved yet");
    expect(gone).not.toContain("None of the three is approved");
    const napaMissing = decode(render(pilotStats({ missing: [P.napa] }), true));
    expect(napaMissing).not.toContain("Napa is not approved yet");
    const domMissing = decode(render(pilotStats({ missing: [P.domperidone] })));
    expect(domMissing).not.toContain("None of the three is approved");
  });

  it("the reviewer-access panels are withdrawn with their records (§6.8)", () => {
    const napa = render(pilotStats({ withdrawn: [P.napa] }));
    expect(napa).toMatch(/<div id="prod-all"><div class="snap" data-withdrawn="">/);
    expect(napa).not.toContain("BDC-000001");
    expect(napa).not.toContain("Acetaminophen 500 mg");
    const warf = render(pilotStats({ withdrawn: [P.warfarin] }));
    expect(warf).toMatch(/<div id="chk-all"><div class="snap" data-withdrawn="">/);
    expect(warf).not.toContain("Aspirin, even in small doses");
    expect(warf).toContain(JSON.stringify(CHECK_PUBLIC, null, 2).replace(/"/g, "&quot;"));
  });

  it("without JavaScript both panels show and the switch is hidden (§6.8)", () => {
    for (const id of ["prod-public", "prod-all", "chk-public", "chk-all"]) expect(html).toContain(`<div id="${id}">`);
    expect(html.match(/<div class="seg" role="group" aria-label="Who is asking" data-switch="(prod|chk)" hidden="">/g)).toHaveLength(2);
    expect(html.match(/<pre class="codePre" tabindex="0" role="region" aria-label="[^"]+">/g)).toHaveLength(6);
  });
});
