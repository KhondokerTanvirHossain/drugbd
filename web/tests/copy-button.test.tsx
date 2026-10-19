// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CopyButton from "@/components/qa/CopyButton";
import { QA_LIVE_ID } from "@/components/qa/live";

/* §5.18, §11.1 "QA keys island": the CopyButton island. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });
const live = () => document.getElementById(QA_LIVE_ID)!.textContent;
function mount() {
  return render(<>
    <div id={QA_LIVE_ID} role="status" className="sr-only" />
    <pre id="snippet">claude mcp add --transport http intellidrugs-qa https://drugdb.example/api/qa/mcp</pre>
    <CopyButton target="snippet" label="Copy command" />
  </>);
}

beforeEach(() => { window.getSelection()?.removeAllRanges(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("CopyButton (§4.2, §5.18)", () => {
  it("is hidden in the server HTML (no JavaScript, no dead button) and shows once it mounts", () => {
    expect(renderToStaticMarkup(<CopyButton target="x" label="Copy address" />))
      .toBe('<button hidden="" type="button" class="btn btn--plain btn--sm">Copy address</button>');
    mount();
    expect(screen.getByRole("button", { name: "Copy command" }).hidden).toBe(false);
  });

  it("writes the target's text, read at press time, and announces Copied.", async () => {
    const writeText = vi.fn(async (_t: string) => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    mount();
    document.getElementById("snippet")!.textContent = "changed after render";
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy command" })); });
    expect(writeText).toHaveBeenCalledWith("changed after render");
    await settle();
    expect(live()).toBe("Copied.");
  });

  it.each([
    ["refused", { clipboard: { writeText: vi.fn(async () => { throw new Error("NotAllowedError"); }) } }],
    ["unavailable", { clipboard: undefined }],
  ])("a %s clipboard: the text is selected and the fallback announced", async (_n, over) => {
    vi.stubGlobal("navigator", { ...navigator, ...over });
    mount();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy command" })); });
    expect(window.getSelection()!.toString()).toContain("claude mcp add");
    await settle();
    expect(live()).toBe("Couldn't copy. The text is selected; press Ctrl C (Cmd C on Mac) to copy it.");
  });
});
