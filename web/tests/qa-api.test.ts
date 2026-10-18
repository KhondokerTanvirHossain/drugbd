import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Counts every constant-time comparison, so the test can pin "one per configured entry, no early exit" (§7.9.1).
const compares = vi.hoisted(() => ({ n: 0 }));
vi.mock("node:crypto", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:crypto")>();
  return { ...real, timingSafeEqual: (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => { compares.n++; return real.timingSafeEqual(a, b); } };
});

import { authenticate, parseQaKeys, qaKeys, qaKeysForTests } from "@/lib/qa-api";

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const KEY_A = "qa-key-a-0123456789abcdefghijklmnopqrstuv", KEY_B = "qa-key-b-0123456789abcdefghijklmnopqrstuv";
const ENTRY_A = `checker:${sha(KEY_A)}`, ENTRY_B = `nightly_2:${sha(KEY_B)}`;

beforeEach(() => { compares.n = 0; qaKeysForTests.reset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("QA_API_KEYS parsing (§7.9.1)", () => {
  it("reads label:sha256hex entries, trimmed, in order", () => {
    const p = parseQaKeys(` ${ENTRY_A} , ${ENTRY_B}`);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.keys.map((k) => k.label)).toEqual(["checker", "nightly_2"]);
    expect(p.keys[0].digest.toString("hex")).toBe(sha(KEY_A));
  });

  it("unset or empty disables the QA API with no log line", () => {
    for (const raw of [undefined, "", "   "]) expect(parseQaKeys(raw)).toEqual({ ok: false, invalidEntry: null });
  });

  it.each([
    ["a bad label (upper case)", `Checker:${sha(KEY_A)}`, 1],
    ["a bad label (leading dash)", `-checker:${sha(KEY_A)}`, 1],
    ["a label over 32 characters", `${"a".repeat(33)}:${sha(KEY_A)}`, 1],
    ["an empty label", `:${sha(KEY_A)}`, 1],
    ["no colon", `checker${sha(KEY_A)}`, 1],
    ["an upper-case hash", `checker:${sha(KEY_A).toUpperCase()}`, 1],
    ["a short hash", `checker:${sha(KEY_A).slice(1)}`, 1],
    ["a raw key instead of a hash", `checker:${KEY_A}`, 1],
    ["an empty entry", `${ENTRY_A},,${ENTRY_B}`, 2],
    ["a trailing comma", `${ENTRY_A},`, 2],
    ["a duplicate label", `${ENTRY_A},checker:${sha(KEY_B)}`, 2],
    ["a duplicate hash", `${ENTRY_A},other:${sha(KEY_A)}`, 2],
  ])("%s fails closed, naming the entry (1-based)", (_name, raw, entry) => {
    expect(parseQaKeys(raw)).toEqual({ ok: false, invalidEntry: entry });
  });

  it("an invalid value logs one line, once, with the entry index only (never the value)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("QA_API_KEYS", `${ENTRY_A},Bad:${sha(KEY_B)}`);
    expect(qaKeys()).toBeNull();
    expect(qaKeys()).toBeNull();
    expect(error.mock.calls).toEqual([["QA_API_KEYS invalid: entry 2"]]);
    expect(JSON.stringify(error.mock.calls)).not.toContain(sha(KEY_B));
  });

  it("follows the environment: a corrected value enables the API without a restart of the module", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("QA_API_KEYS", "nonsense");
    expect(qaKeys()).toBeNull();
    vi.stubEnv("QA_API_KEYS", ENTRY_A);
    expect(qaKeys()?.map((k) => k.label)).toEqual(["checker"]);
    vi.stubEnv("QA_API_KEYS", "");
    expect(qaKeys()).toBeNull();
  });
});

describe("Bearer authentication (§7.9.1)", () => {
  const keys = () => {
    const p = parseQaKeys(`${ENTRY_A},${ENTRY_B}`);
    if (!p.ok) throw new Error("fixture");
    return p.keys;
  };

  it("returns the label of the matching key; the scheme is case-insensitive", () => {
    expect(authenticate(`Bearer ${KEY_A}`, keys())).toBe("checker");
    expect(authenticate(`bearer ${KEY_B}`, keys())).toBe("nightly_2");
    expect(authenticate(`BEARER ${KEY_B}`, keys())).toBe("nightly_2");
  });

  it.each([
    ["no header", null],
    ["another scheme", `Basic ${KEY_A}`],
    ["no scheme", KEY_A],
    ["two spaces", `Bearer  ${KEY_A}`],
    ["a short key (31 characters)", `Bearer ${"k".repeat(31)}`],
    ["a long key (257 characters)", `Bearer ${"k".repeat(257)}`],
    ["a character outside the token set", `Bearer ${KEY_A.slice(0, 40)}!`],
    ["an unknown key", `Bearer ${"z".repeat(40)}`],
    ["the hash instead of the key", `Bearer ${sha(KEY_A)}`],
    ["a trailing word", `Bearer ${KEY_A} extra`],
  ])("%s is refused", (_name, header) => {
    expect(authenticate(header, keys())).toBeNull();
  });

  it("accepts every character of the token set and the 32 and 256 length bounds", () => {
    for (const key of ["A".repeat(32), "a".repeat(256), "Az09._~+/=-".repeat(4)]) {
      const p = parseQaKeys(`x:${sha(key)}`);
      if (!p.ok) throw new Error("fixture");
      expect(authenticate(`Bearer ${key}`, p.keys)).toBe("x");
    }
  });

  it("compares the digest with every configured hash, also when the first one matches", () => {
    expect(authenticate(`Bearer ${KEY_A}`, keys())).toBe("checker");
    expect(compares.n).toBe(2);
    compares.n = 0;
    expect(authenticate(`Bearer ${"z".repeat(40)}`, keys())).toBeNull();
    expect(compares.n).toBe(2);
  });
});
