import type { ComponentType } from "react";
import type { LearnContext } from "@/components/learn/context";
import type { ChapterSlug } from "./chapters";
import CodesChapter from "./codes";
import FaqChapter from "./faq";
import GlossaryChapter from "./glossary";
import InteractionsChapter from "./interactions";
import ModelChapter from "./model";
import PartnersChapter from "./partners";
import ProcessChapter from "./process";
import ReviewersChapter from "./reviewers";
import StartChapter from "./start";
import WhyChapter from "./why";

/** The body of each Learn chapter route (§2.1, §6.8). */
export const CHAPTER_BODIES: Record<ChapterSlug, ComponentType<{ ctx: LearnContext }>> = {
  start: StartChapter, model: ModelChapter, codes: CodesChapter, process: ProcessChapter, why: WhyChapter,
  interactions: InteractionsChapter, reviewers: ReviewersChapter, partners: PartnersChapter, glossary: GlossaryChapter, faq: FaqChapter,
};
