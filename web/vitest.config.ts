import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const p = (f: string) => fileURLToPath(new URL(f, import.meta.url));
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    // e2e/*.spec.ts belong to Playwright, never to vitest.
    include: ["tests/**/*.test.{ts,tsx}"],
    // D74: every test reads the public mode as approved-only unless it says otherwise (tests/setup/public-mode.ts).
    setupFiles: ["tests/setup/public-mode.ts"],
    // CSS Modules resolve to their local class names, so tests can assert `class="… open"`.
    css: { include: [/\.module\.css$/], modules: { classNameStrategy: "non-scoped" } },
  },
  resolve: { alias: { "server-only": p("./tests/stubs/server-only.ts"), "@": p("./") } },
});
