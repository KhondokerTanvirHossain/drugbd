"use client";
import { useEffect } from "react";
import { enhanceLearn } from "./enhance";

/**
 * Island (§4.2 LearnRail, the row as amended by P3 Task 0): the "On this page" scroll-spy, plus the two other Learn
 * enhancements §6.8 asks for that need JavaScript: the narrow chapter row scrolled to the current chapter, and chapter 8's
 * `.seg` example switches. Renders nothing.
 */
export default function LearnRail() {
  useEffect(() => enhanceLearn(document, window), []);
  return null;
}
