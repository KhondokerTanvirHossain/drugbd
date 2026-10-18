import { describe, expect, it, vi } from "vitest";
import { DEFAULT_BASE_URL, parseConfig } from "../src/config.js";
import { run } from "../src/main.js";
import { KEY } from "./helpers.js";

describe("parseConfig (§7.9.8 Env)", () => {
  it("defaults the base URL to https://drugdb.eliooo.org", () => {
    expect(DEFAULT_BASE_URL).toBe("https://drugdb.eliooo.org");
    expect(parseConfig({ INTELLIDRUGS_QA_KEY: KEY })).toEqual({ ok: true, config: { key: KEY, origin: "https://drugdb.eliooo.org" } });
    expect(parseConfig({ INTELLIDRUGS_QA_KEY: KEY, INTELLIDRUGS_QA_BASE_URL: "" }))
      .toEqual({ ok: true, config: { key: KEY, origin: "https://drugdb.eliooo.org" } });
  });

  it.each([
    ["https://drugdb.eliooo.org", "https://drugdb.eliooo.org"],
    ["https://drugdb.eliooo.org/", "https://drugdb.eliooo.org"],
    ["https://staging.example.org:8443", "https://staging.example.org:8443"],
    ["HTTPS://DrugDB.Eliooo.org", "https://drugdb.eliooo.org"],
    ["http://localhost:3000", "http://localhost:3000"],
    ["http://127.0.0.1:3000/", "http://127.0.0.1:3000"],
    ["http://localhost", "http://localhost"],
  ])("accepts %s as origin %s", (base, origin) => {
    expect(parseConfig({ INTELLIDRUGS_QA_KEY: KEY, INTELLIDRUGS_QA_BASE_URL: base })).toEqual({ ok: true, config: { key: KEY, origin } });
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
  ])("a %s key is refused with 'INTELLIDRUGS_QA_KEY is not set'", (_n, key) => {
    expect(parseConfig({ INTELLIDRUGS_QA_KEY: key })).toEqual({ ok: false, message: "INTELLIDRUGS_QA_KEY is not set" });
  });

  it.each([
    ["too short", "abc"],
    ["too long", "a".repeat(257)],
    ["a space", `${KEY} x`],
    ["a newline", `${KEY}\n`],
    ["a non-token character", `${KEY}!`],
  ])("a key with %s is refused without echoing it", (_n, key) => {
    const r = parseConfig({ INTELLIDRUGS_QA_KEY: key });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(/^INTELLIDRUGS_QA_KEY is not a valid QA key/);
      expect(r.message).not.toContain(key.trim());
    }
  });

  it.each([
    "http://drugdb.eliooo.org",
    "http://localhost.example.org",
    "http://127.0.0.2",
    "http://[::1]:3000",
    "ftp://drugdb.eliooo.org",
    "file:///etc/passwd",
    "https://user:secret@drugdb.eliooo.org",
    "https://user@drugdb.eliooo.org",
    "https://drugdb.eliooo.org/?x=1",
    "https://drugdb.eliooo.org/?",
    "https://drugdb.eliooo.org/#top",
    "https://drugdb.eliooo.org#",
    "https://drugdb.eliooo.org/api",
    "drugdb.eliooo.org",
    "not a url",
    " https://drugdb.eliooo.org",
  ])("refuses the base URL %j without echoing it", (base) => {
    const r = parseConfig({ INTELLIDRUGS_QA_KEY: KEY, INTELLIDRUGS_QA_BASE_URL: base });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(/^INTELLIDRUGS_QA_BASE_URL is invalid/);
      expect(r.message).not.toContain(base.trim());
      expect(r.message).not.toContain("secret");
    }
  });
});

describe("run (startup)", () => {
  const io = () => {
    const err: string[] = [];
    const connect = vi.fn(async () => {});
    return { err, connect, io: { writeErr: (s: string) => { err.push(s); }, connect } };
  };

  it("a missing key writes 'INTELLIDRUGS_QA_KEY is not set' to stderr and exits 1, never connecting", async () => {
    const t = io();
    expect(await run({}, t.io)).toBe(1);
    expect(t.err).toEqual(["INTELLIDRUGS_QA_KEY is not set\n"]);
    expect(t.connect).not.toHaveBeenCalled();
  });

  it.each(["http://drugdb.eliooo.org", "https://u:p@drugdb.eliooo.org", "https://drugdb.eliooo.org/?q", "https://drugdb.eliooo.org/#f",
    "nope"])("the bad base URL %j exits 1 and never connects", async (base) => {
    const t = io();
    expect(await run({ INTELLIDRUGS_QA_KEY: KEY, INTELLIDRUGS_QA_BASE_URL: base }, t.io)).toBe(1);
    expect(t.err).toHaveLength(1);
    expect(t.err[0]).toMatch(/^INTELLIDRUGS_QA_BASE_URL is invalid.*\n$/);
    expect(t.err.join("")).not.toContain(KEY);
    expect(t.connect).not.toHaveBeenCalled();
  });

  it("a malformed key exits 1 and its stderr line never contains the key", async () => {
    const t = io();
    const bad = `${KEY}\u0007`;
    expect(await run({ INTELLIDRUGS_QA_KEY: bad }, t.io)).toBe(1);
    expect(t.err.join("")).not.toContain(KEY);
    expect(t.connect).not.toHaveBeenCalled();
  });

  it("a valid configuration connects the server and writes nothing to stderr", async () => {
    const t = io();
    expect(await run({ INTELLIDRUGS_QA_KEY: KEY }, t.io)).toBe(0);
    expect(t.connect).toHaveBeenCalledTimes(1);
    expect(t.err).toEqual([]);
  });
});
