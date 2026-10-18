// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import Expander from "@/components/Expander";

afterEach(cleanup);
const Fixture = ({ label }: { label: "reviewer" | "public" }) => (
  <><p id="t" className="pair-text open">Long DDInter text</p><Expander targetId="t" label={label} /></>);

describe("Expander island (§4.2)", () => {
  it("clamps the text once hydrated and toggles it (reviewer wording)", async () => {
    render(<Fixture label="reviewer" />);
    const button = await screen.findByRole("button", { name: "Full text from DDInter 2.0" });
    const text = document.getElementById("t")!;
    expect(text.classList.contains("open")).toBe(false);
    expect(button.getAttribute("aria-controls")).toBe("t");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(text.classList.contains("open")).toBe(true);
    expect(screen.getByRole("button", { name: "Show less" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("uses the public wording on public and Learn pages", async () => {
    render(<Fixture label="public" />);
    fireEvent.click(await screen.findByRole("button", { name: "Show full text" }));
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
  });

  it("describedBy sets aria-describedby, for two Expanders in one card (§4.2, §6.7.3); absent, there is none", async () => {
    render(<><p id="t" className="pair-text open">Long text</p><span id="k">Management, truncated.</span>
      <Expander targetId="t" label="public" describedBy="k" /></>);
    expect((await screen.findByRole("button", { name: "Show full text" })).getAttribute("aria-describedby")).toBe("k");
    cleanup();
    render(<Fixture label="public" />);
    expect((await screen.findByRole("button", { name: "Show full text" })).hasAttribute("aria-describedby")).toBe(false);
  });

  it("renders nothing on the server", () => {
    expect(renderToStaticMarkup(<Expander targetId="t" label="public" />)).toBe("");
  });
});
