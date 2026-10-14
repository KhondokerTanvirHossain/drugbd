import { expect, test } from "@playwright/test";

test("POST /api/session: the 11th attempt in 10 minutes is 429 with the sign-in message (§9.3)", async ({ request }) => {
  const statuses: number[] = [];
  for (let i = 0; i < 10; i++) statuses.push((await request.post("/api/session", { data: {} })).status());
  expect(statuses).toEqual(Array(10).fill(400));
  const res = await request.post("/api/session", { data: {} });
  expect(res.status()).toBe(429);
  expect((await res.json()).message).toBe("Too many sign-in attempts. Wait a few minutes and try again.");
});
