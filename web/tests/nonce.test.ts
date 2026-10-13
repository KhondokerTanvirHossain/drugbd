import { describe, expect, it, vi } from "vitest";

const headers = vi.fn();
vi.mock("next/headers", () => ({ headers: () => headers() }));
import { cspNonce } from "@/lib/nonce";

describe("cspNonce", () => {
  it("reads x-nonce from the request", async () => {
    headers.mockResolvedValue(new Headers({ "x-nonce": "abc" }));
    expect(await cspNonce()).toBe("abc");
  });
  it("is undefined when there is none or outside a request", async () => {
    headers.mockResolvedValue(new Headers());
    expect(await cspNonce()).toBeUndefined();
    headers.mockRejectedValue(new Error("headers() was called outside a request scope"));
    expect(await cspNonce()).toBeUndefined();
  });
});
