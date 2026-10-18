import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { parseConfig } from "./config.js";
import type { FetchOptions } from "./client.js";
import { createServer } from "./server.js";

export type Io = { writeErr: (text: string) => void; connect: (server: Server) => Promise<void>; fetch?: FetchOptions["fetch"] };

/**
 * Reads the environment and starts the server. On a bad environment it writes one line to stderr (never a value) and
 * returns 1 without connecting; otherwise it connects and returns 0. stdout is left to the protocol.
 */
export async function run(env: Readonly<Record<string, string | undefined>>, io: Io): Promise<number> {
  const parsed = parseConfig(env);
  if (!parsed.ok) {
    io.writeErr(`${parsed.message}\n`);
    return 1;
  }
  await io.connect(createServer(parsed.config, io.fetch ? { fetch: io.fetch } : {}));
  return 0;
}
