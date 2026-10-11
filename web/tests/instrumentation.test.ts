import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { register } from "../instrumentation";

// Next.js only logs an error thrown from register() and keeps serving 500s, so the hook must exit the process.
let exit: MockInstance;
let error: MockInstance;
beforeEach(() => {
  exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as never);
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); exit.mockRestore(); error.mockRestore(); });

describe("startup check (instrumentation register)", () => {
  it("exits with code 1 and a clear message when SESSION_SECRET is shorter than 32 characters", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("SESSION_SECRET", "too-short-secret");
    await expect(register()).rejects.toThrow("process.exit(1)");
    expect(exit).toHaveBeenCalledWith(1);
    const logged = error.mock.calls.flat().map(String).join(" ");
    expect(logged).toMatch(/SESSION_SECRET must be at least 32 characters/);
    expect(logged).not.toContain("too-short-secret");
  });

  it("exits when SESSION_SECRET is unset", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("SESSION_SECRET", undefined as unknown as string);
    await expect(register()).rejects.toThrow("process.exit(1)");
  });

  it("starts with a 32-character secret", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("SESSION_SECRET", "k".repeat(32));
    await expect(register()).resolves.toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
  });

  it("does nothing outside the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("SESSION_SECRET", "");
    await expect(register()).resolves.toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
  });
});
