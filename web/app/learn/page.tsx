import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** §2.1: "/learn | Redirects 307 to /learn/start" (a server component's redirect() answers 307). */
export default function LearnIndex() {
  redirect("/learn/start");
}
