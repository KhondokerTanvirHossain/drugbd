// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import AccountMenu from "@/components/AccountMenu";

afterEach(cleanup);
const setup = () => render(<>
  <AccountMenu><summary tabIndex={0}>Account</summary><button type="button">Inside</button></AccountMenu>
  <p>Outside</p>
</>);

describe("AccountMenu island (§4.2)", () => {
  it("Esc closes the open menu and returns focus to its summary", () => {
    const { container } = setup();
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent.keyDown(document, { key: "Escape" });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(container.querySelector("summary"));
  });

  it("a press outside closes it; a press inside keeps it open", () => {
    const { container } = setup();
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent.pointerDown(screen.getByText("Inside"));
    expect(details.open).toBe(true);
    fireEvent.pointerDown(screen.getByText("Outside"));
    expect(details.open).toBe(false);
  });

  it("is a plain <details> without JavaScript", () => {
    expect(renderToStaticMarkup(<AccountMenu><summary>A</summary></AccountMenu>)).toBe('<details class="menu"><summary>A</summary></details>');
  });
});
