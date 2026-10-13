import { ROLE_LABEL } from "@/lib/reviewers";
import { getSession } from "@/lib/session";
import SignInButton, { type FirebaseWebConfig } from "./SignInButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reviewer sign-in · BDDrug KB" };

export default async function SignInPage() {
  const session = await getSession();
  const config: FirebaseWebConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.FIREBASE_PROJECT_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };
  const configured = Object.values(config).every((v) => v.length > 0);

  return (
    <>
      <h1>Reviewer sign-in</h1>
      <p>
        Only listed pharmacists and engineers can review batch records. Any other Google account can sign in to flag
        problems.
      </p>
      {session ? (
        <>
          <p>Signed in as {ROLE_LABEL[session.role]}.</p>
          <form method="post" action="/signout"><button type="submit">Sign out</button></form>
        </>
      ) : configured ? (
        <SignInButton config={config} />
      ) : (
        <p role="alert">Reviewer sign-in is not configured.</p>
      )}
    </>
  );
}
