import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));

import Header from "@/components/Header";
import ReviewAccount from "@/components/review/ReviewAccount";
import ReviewToolbar from "@/components/review/ReviewToolbar";
import type { Role } from "@/lib/reviewers";

/* §5.1, §6.2, §11.2 (QA portal): the "QA tools" account-menu item and toolbar link, for qa, engineer and senior only. */
const session = (role: Role) => ({ email: `${role}@example.org`, name: "N", role });
const QA_ITEM = /<a [^>]*href="\/review\/qa"[^>]*>QA tools<\/a>/;
const QA_ROLES: Role[] = ["qa", "engineer", "senior"];
const OTHER_ROLES: Role[] = ["pharmacist", "user"];

const header = (role: Role) => renderToStaticMarkup(<Header session={session(role)} theme="light" batchId="0001-pilot" />);
const account = (role: Role) => renderToStaticMarkup(
  <ReviewAccount session={session(role)} theme="light" batchId="0001-pilot" keys="on" shortcutsItem />);
const toolbar = (role: Role, current?: "qa") => renderToStaticMarkup(
  <ReviewToolbar session={session(role)} theme="light" batchId="0001-pilot" current={current} />);

describe("account menus (§6.2)", () => {
  it.each(QA_ROLES)("%s: both menus carry QA tools, after Senior review", (role) => {
    for (const html of [header(role), account(role)]) {
      expect(html).toMatch(QA_ITEM);
      if (role === "senior") expect(html.indexOf("Senior review")).toBeLessThan(html.indexOf("QA tools"));
    }
  });

  it.each(OTHER_ROLES)("%s: no QA tools item", (role) => {
    expect(header(role)).not.toContain("/review/qa");
    expect(account(role)).not.toContain("/review/qa");
  });

  it("a qa menu: the QA badge and no batch, no Review desk, no flags link, no single-key control", () => {
    for (const html of [header("qa"), account("qa")]) {
      expect(html).toContain('<span class="role-badge">QA</span>');
      expect(html).not.toContain("0001-pilot");
      expect(html).not.toContain("Review desk");
      expect(html).not.toContain("/review/flags");
      expect(html).not.toContain("Single-key shortcuts");
      expect(html).not.toContain("Keyboard shortcuts and settings");
    }
  });

  it("an engineer's menus are unchanged apart from the new item", () => {
    for (const html of [header("engineer"), account("engineer")]) {
      expect(html).toContain("Review desk");
      expect(html).toContain("0001-pilot");
    }
  });
});

describe("reviewer toolbar (§5.1)", () => {
  it.each(QA_ROLES)("%s: a plain QA tools link before the role badge, current on /review/qa only", (role) => {
    const html = toolbar(role);
    const link = html.match(/<a [^>]*href="\/review\/qa"[^>]*>QA tools<\/a>/g) ?? [];
    expect(link.length).toBe(2);   // the toolbar link and the account-menu item
    expect(html).not.toContain('aria-current="page"');
    const current = toolbar(role, "qa");
    expect(current).toMatch(/<a class="toolbarLink" href="\/review\/qa" aria-current="page">QA tools<\/a>/);
    expect(current.indexOf("toolbarLink")).toBeLessThan(current.indexOf("role-badge"));
  });

  it("the qa badge reads QA; pharmacists and readers get no link", () => {
    expect(toolbar("qa")).toMatch(/QA tools<\/a><span class="role-badge">QA<\/span>/);
    for (const role of OTHER_ROLES) expect(toolbar(role)).not.toContain("/review/qa");
    expect(toolbar("pharmacist")).toContain('<span class="role-badge">Pharmacist</span>');
  });
});
