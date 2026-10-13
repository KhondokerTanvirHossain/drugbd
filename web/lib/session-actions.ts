"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookieName } from "./session";

/** Sign-out from the header's plain <form> (works without client JS; server actions check the Origin). */
export async function signOutAction(): Promise<void> {
  (await cookies()).delete(sessionCookieName());
  redirect("/");
}
