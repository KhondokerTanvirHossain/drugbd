import { submitPartnerRequest } from "@/lib/actions-core";
import { formPost } from "@/lib/form-post";
import { withRequestLog } from "@/lib/request-log";

export const dynamic = "force-dynamic";

/** §6.9: the partner request form's native POST; 303 to /partners with the outcome at #request (lib/form-post.ts). */
async function handle(request: Request): Promise<Response> {
  return formPost(request, "action:partner", submitPartnerRequest,
    (_fd, code) => `/partners?${new URLSearchParams({ partner: code })}#request`);
}

export const POST = withRequestLog("/partners/request", handle);
