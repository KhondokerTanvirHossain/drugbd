import { qaNotFound } from "@/lib/qa-api";

export const dynamic = "force-dynamic";

/** `/api/qa` and every unknown QA path: the 404 envelope, whether or not the QA API is enabled; no audit row (§7.9). */
export const GET = qaNotFound("/api/qa/[[...rest]]");
