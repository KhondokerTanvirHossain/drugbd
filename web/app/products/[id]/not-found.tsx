import { headers } from "next/headers";
import { buttonClass } from "@/components/ui/Button";
import { PUBLIC_NEW, fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";

/** §6.4 "Unknown id": "No medicine with the id {id}." with "Search medicines". Inside the root layout's <main>. */
export default async function ProductNotFound() {
  const segment = (await headers()).get("x-pathname")?.split("/")[2] ?? "";
  let id = segment;
  try { id = decodeURIComponent(segment); } catch { /* keep the raw segment */ }
  return (
    <>
      <h1>{fill(PUBLIC_NEW.notFound.text, { id })}</h1>
      <p><a className={buttonClass("tonal")} href="/search">{DESK.searchMedicines}</a></p>
    </>
  );
}
