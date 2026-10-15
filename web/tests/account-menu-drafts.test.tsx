// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AccountMenu from "@/components/AccountMenu";
import { draftKey, saveDraft } from "@/components/review/desk/drafts";

afterEach(() => { cleanup(); sessionStorage.clear(); });

describe("sign-out clears note drafts (§5.10)", () => {
  it("submitting the menu's sign-out form removes every draft and nothing else", () => {
    saveDraft("0001-pilot", "186-0030-006--napa", "Strength reads 500 mg on the box");
    sessionStorage.setItem("other-key", "kept");
    const { container } = render(
      <AccountMenu><summary>Menu</summary><form method="post" action="/signout" onSubmit={(e) => e.preventDefault()}>
        <button type="submit">Sign out</button></form></AccountMenu>);
    fireEvent.submit(container.querySelector("form")!);
    expect(sessionStorage.getItem(draftKey("0001-pilot", "186-0030-006--napa"))).toBeNull();
    expect(sessionStorage.getItem("other-key")).toBe("kept");
  });

  it("another form in the menu (the theme switch) keeps the drafts", () => {
    saveDraft("0001-pilot", "x", "draft");
    const { container } = render(
      <AccountMenu><summary>Menu</summary><form action="/theme" onSubmit={(e) => e.preventDefault()}><button type="submit">Dark</button></form></AccountMenu>);
    fireEvent.submit(container.querySelector("form")!);
    expect(sessionStorage.getItem(draftKey("0001-pilot", "x"))).toBe("draft");
  });
});
