/**
 * The ten Learn chapters (spec §2.1, §6.8): slug, number, nav label, title, lede and the sections the "On this page"
 * rail lists. Names only, no JSX: lib/surface.ts (and through it the middleware) imports this file. Titles, ledes and
 * section headings are Board L's, with §1.6 item 5's "The pairs that apply to the pilot products".
 */
export type LearnSection = { id: string; title: string };
export type LearnChapter = { slug: string; n: number; nav: string; title: string; lede: string; sections: readonly LearnSection[] };

const s = (id: string, title: string): LearnSection => ({ id, title });

export const CHAPTERS = [
  { slug: "start", n: 1, nav: "Start here", title: "Start here",
    lede: "IntelliDrugs links every medicine registered in Bangladesh to the substances inside it, to the codes other systems use, and to published interaction data. A pharmacist checks each record before anyone outside the team can see it.",
    sections: [s("start-what", "What IntelliDrugs is"), s("start-who", "Who it is for"), s("start-not", "What it is not"),
      s("start-read", "How to read a record")] },
  { slug: "model", n: 2, nav: "The model", title: "The model",
    lede: "Three levels carry every record: the brand product DGDA registered, the clinical drug it is, and the substances inside it. Codes and interactions hang off the substance, so one DDInter record serves every brand that contains it.",
    sections: [s("model-diagram", "Brand product, clinical drug, substance"), s("model-napa", "Napa, traced through the model"),
      s("model-edges", "Edge cases from the pilot")] },
  { slug: "codes", n: 3, nav: "IDs and code systems", title: "Our IDs and the code systems",
    lede: "External codes change, merge or go missing for medicines sold only in Bangladesh. So every substance and clinical drug gets our own permanent id, and the outside codes hang off it as crosswalks.",
    sections: [s("codes-ids", "Why our own BDS and BDC ids"), s("codes-systems", "What each code is for"),
      s("codes-match", "How a code is matched")] },
  { slug: "process", n: 4, nav: "The process", title: "The process",
    lede: "Records enter in small batches. A pipeline runs four checks on each one and keeps every source response. People then compare the source with what we extracted, and only a pharmacist's approval makes a record public.",
    sections: [s("process-flow", "The whole flow"), s("process-batches", "Batches of 10, then 50, then 100"),
      s("process-stages", "Four stage checks"), s("process-evidence", "Evidence is kept"), s("process-gate", "The review gate"),
      s("process-rerun", "A re-run sends a record back to review"), s("process-done", "A batch is approved when every record is")] },
  { slug: "why", n: 5, nav: "Why it works this way", title: "Why it works this way",
    lede: "Each rule below exists because the simpler choice would put a wrong or unchecked fact in front of a prescriber.",
    sections: [s("why-dgda", "Why DGDA is the source of truth"), s("why-substance", "Why interactions attach to substances"),
      s("why-batches", "Why people review in small batches"), s("why-nodata", "Why no data never means safe"),
      s("why-unclassified", "Why unclassified severity stands apart"), s("why-pharmacist", "Why only a pharmacist can publish")] },
  { slug: "interactions", n: 6, nav: "Interactions explained", title: "Interactions explained",
    lede: "Interaction data comes from DDInter 2.0. We show DDInter's grade, mechanism and text as DDInter gives them, and we say plainly where DDInter has nothing.",
    sections: [s("int-severity", "Severity levels"), s("int-pilot", "The pairs that apply to the pilot products"),
      s("int-substance", "Per substance"), s("int-actions", "Actions: how two drugs interact"),
      s("int-disease", "Drug–disease, drug–food and coverage"), s("int-check", "A worked check")] },
  { slug: "reviewers", n: 7, nav: "For reviewers", title: "For reviewers",
    lede: "Reviewers are pharmacists and engineers, invited by the team. You sign in with Google, open a batch, and compare each record's DGDA source with what the pipeline extracted.",
    sections: [s("rev-checklist", "The review checklist"), s("rev-labels", "What each relation label means"),
      s("rev-warnings", "Each record's DDInter warning, pair by pair"), s("rev-issue", "How to report a good issue"),
      s("rev-decide", "Deciding: Looks correct, with an undo window"), s("rev-keys", "Keyboard shortcuts")] },
  { slug: "partners", n: 8, nav: "For partners", title: "For partners",
    lede: "The REST API serves the same records as the website. Without reviewer access it returns approved records only, and it says so when a record is not approved yet.",
    sections: [s("api-status", "Where the API stands"), s("api-endpoints", "Endpoints"), s("api-envelope", "The response envelope"),
      s("api-product", "Example: a product"), s("api-check", "Example: an interaction check"),
      s("api-must", "Safety fields you must display"), s("api-versions", "Versioning and data releases")] },
  { slug: "glossary", n: 9, nav: "Glossary", title: "Glossary",
    lede: "Every term used on IntelliDrugs, with a one-line definition and a real example from the pilot.",
    sections: [s("gl-terms", "Terms A to Z")] },
  { slug: "faq", n: 10, nav: "FAQ", title: "FAQ",
    lede: "Short answers to the questions people ask first.",
    sections: [s("faq-list", "Questions")] },
] as const satisfies readonly LearnChapter[];

export type ChapterSlug = (typeof CHAPTERS)[number]["slug"];
export const CHAPTER_SLUGS: readonly ChapterSlug[] = CHAPTERS.map((c) => c.slug);

/** The chapter for an exact slug (case and spelling as in §2.1), or null. */
export function chapterBySlug(slug: string): LearnChapter & { slug: ChapterSlug } | null {
  return CHAPTERS.find((c) => c.slug === slug) ?? null;
}

/** A section heading by its id; throws on an unknown id (a content bug, caught by the chapter tests). */
export function sectionTitle(id: string): string {
  for (const c of CHAPTERS) for (const x of c.sections) if (x.id === id) return x.title;
  throw new Error(`Learn: no section ${id}`);
}
