import { flagReturnPath, submitFlag } from "@/lib/actions-core";
import { formPost } from "@/lib/form-post";
import { withRequestLog } from "@/lib/request-log";

export const dynamic = "force-dynamic";

/** §6.5 "Report a problem": the form's native POST; 303 back to the flagged page with the outcome at #flag (lib/form-post.ts). */
async function handle(request: Request): Promise<Response> {
  return formPost(request, "action:flag", (fd) => submitFlag(fd), (fd, code) => {
    const path = flagReturnPath(String(fd.get("targetType") ?? ""), String(fd.get("targetId") ?? ""));
    return `${path}${path.includes("?") ? "&" : "?"}flag=${code}#flag`;
  });
}

export const POST = withRequestLog("/flag", handle);
