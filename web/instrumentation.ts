/**
 * Runs once when the Next.js server starts (Next skips it during `next build`). The app refuses to start without a
 * SESSION_SECRET of at least 32 characters. Next.js only logs an error thrown here and keeps serving, so the hook
 * exits the process itself; the message names the variable, never its value.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertSessionSecret } = await import("./lib/session");
  try {
    assertSessionSecret();
  } catch (e) {
    console.error(`Refusing to start: ${(e as Error).message}`);
    process.exit(1);
  }
}
