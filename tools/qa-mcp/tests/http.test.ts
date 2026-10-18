import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callTool } from "../src/server.js";
import { KEY, PREAMBLE_TEXT, envelope } from "./helpers.js";

/*
 * The real fetch against a loopback server: the mocked-fetch tests pin what the client asks for; these pin that Node's
 * fetch honours it (a redirect is refused, so the key never reaches a Location; the timeout fires).
 */

type Seen = { url: string | undefined; authorization: string | undefined };
const seen: Seen[] = [];
let server: Server;
let origin: string;

function handle(req: IncomingMessage, res: ServerResponse) {
  seen.push({ url: req.url, authorization: req.headers.authorization });
  if (req.url === "/api/qa/v1/batches/redirect") {
    res.writeHead(302, { Location: `${origin}/elsewhere` });
    res.end();
  } else if (req.url === "/api/qa/v1/batches/slow") {
    setTimeout(() => { res.writeHead(200); res.end("{}"); }, 2_000).unref();
  } else {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(envelope({ batches: [] })));
  }
}

beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("over real HTTP", () => {
  it("sends the Bearer key and returns the body", async () => {
    seen.length = 0;
    const r = await callTool({ key: KEY, origin }, "list_batches", {});
    expect(r.isError).toBeFalsy();
    expect(seen).toEqual([{ url: "/api/qa/v1/batches", authorization: `Bearer ${KEY}` }]);
  });

  it("refuses a redirect: 'QA API unreachable', and the Location is never requested", async () => {
    seen.length = 0;
    const r = await callTool({ key: KEY, origin }, "get_batch", { batchId: "redirect" });
    expect(r.isError).toBe(true);
    expect(r.content).toEqual([{ type: "text", text: PREAMBLE_TEXT }, { type: "text", text: "QA API unreachable" }]);
    expect(seen.map((s) => s.url)).toEqual(["/api/qa/v1/batches/redirect"]);
  });

  it("times out: 'QA API unreachable'", async () => {
    const r = await callTool({ key: KEY, origin }, "get_batch", { batchId: "slow" }, { timeoutMs: 50 });
    expect(r.isError).toBe(true);
    expect(r.content).toEqual([{ type: "text", text: PREAMBLE_TEXT }, { type: "text", text: "QA API unreachable" }]);
  });

  it("a closed port is 'QA API unreachable'", async () => {
    const r = await callTool({ key: KEY, origin: "http://127.0.0.1:1" }, "list_batches", {});
    expect(r.content).toEqual([{ type: "text", text: PREAMBLE_TEXT }, { type: "text", text: "QA API unreachable" }]);
  });
});
