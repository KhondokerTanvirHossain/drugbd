import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import NotAuthorised from "@/components/review/NotAuthorised";
import { signInHref } from "@/components/review/desk/hrefs";
import { canUseQa, isReviewer } from "@/lib/reviewers";
import { getSession } from "@/lib/session";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

/**
 * §2.3, §5.12: anonymous visitors go to sign-in (the middleware does it first, with the full path); readers see the
 * not-authorised page. QA portal (D66): a session that may use QA tools is admitted too; a layout cannot see the path, so
 * every page below answers a qa session itself (the QA account view, or /review's redirect to /review/qa).
 */
export default async function ReviewLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect(signInHref("/review"));
  if (!isReviewer(session) && !canUseQa(session.role)) return <NotAuthorised session={session} theme={parseTheme((await cookies()).get(THEME_COOKIE)?.value)} />;
  return <>{children}</>;
}
