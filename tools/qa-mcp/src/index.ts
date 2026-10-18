#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { run } from "./main.js";

/** Entry point: `node dist/index.js`. stdout carries the MCP protocol only; startup problems go to stderr, exit 1. */
const code = await run(process.env, {
  writeErr: (text) => { process.stderr.write(text); },
  connect: (server) => server.connect(new StdioServerTransport()),
}).catch(() => {
  process.stderr.write("QA MCP server failed to start\n");
  return 1;
});
if (code !== 0) process.exitCode = code;
