import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const p = (f: string) => fileURLToPath(new URL(f, import.meta.url));
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { environment: "node" },
  resolve: { alias: { "server-only": p("./tests/stubs/server-only.ts"), "@": p("./") } },
});
