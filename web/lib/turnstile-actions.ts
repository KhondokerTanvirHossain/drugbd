/** Turnstile action names (§9.2). Client-safe: the TurnstileField island imports the type. */
export const TURNSTILE_ACTIONS = ["decision", "flag", "resolve", "partner", "signin", "qakey"] as const;
export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[number];
