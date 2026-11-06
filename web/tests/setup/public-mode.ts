import { beforeEach, vi } from "vitest";

/**
 * Every page test reads the public mode through @/lib/public-mode-read. By default it is approved-only, the API's code
 * default, so the existing page assertions stay as they are; a show-mode test sets
 * `vi.mocked(getPublicMode).mockResolvedValue("show_unreviewed")`. public-mode.test.ts tests the real read with vi.importActual.
 */
vi.mock("@/lib/public-mode-read", () => ({ getPublicMode: vi.fn(async () => "approved_only") }));

beforeEach(async () => {
  const { getPublicMode } = await import("@/lib/public-mode-read");
  vi.mocked(getPublicMode).mockReset();
  vi.mocked(getPublicMode).mockResolvedValue("approved_only");
});
