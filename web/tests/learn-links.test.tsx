import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));

import { learnContext } from "@/components/learn/context";
import LearnShell from "@/components/learn/LearnShell";
import { CHAPTER_BODIES } from "@/content/learn";
import { CHAPTER_SLUGS } from "@/content/learn/chapters";
import { pilotStats } from "./fixtures/learn-stats";

const ALLOWED = /^(#[a-z0-9-]+|\/learn\/(start|model|codes|process|why|interactions|reviewers|partners|glossary|faq)(#[a-z0-9-]+)?|https:\/\/[^\s"]+)$/;
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe("Learn links stay inside Learn (G3)", () => {
  it("every href in every chapter and in the shell is an in-page anchor, a Learn chapter or an outside https link", () => {
    for (const slug of CHAPTER_SLUGS) {
      const Body = CHAPTER_BODIES[slug];
      const ctx = learnContext(pilotStats());
      const html = renderToStaticMarkup(<LearnShell slug={slug} ctx={ctx} theme="light"><Body ctx={ctx} /></LearnShell>);
      for (const h of hrefs(html)) {
        expect(h, `${slug}: ${h}`).toMatch(ALLOWED);
        expect(h, `${slug}: ${h}`).not.toMatch(/\/(products|substances|check|review|search)(\/|\?|$)/);
      }
    }
  });
});
