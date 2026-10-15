import { renderToStaticMarkup as r } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Banner, BotCheck, Button, ExampleMarker, Field, Kbd, ProgressMeter, Segmented, buttonClass } from "@/components/ui";

describe("Button", () => {
  it("prints the token classes for each variant and size", () => {
    expect(r(<Button variant="primary">Looks correct <Kbd keys="A" /></Button>))
      .toBe('<button type="button" class="btn btn--primary">Looks correct <span class="kbd">A</span></button>');
    expect(r(<Button variant="tonal" size="sm" type="submit">Report issue</Button>))
      .toBe('<button type="submit" class="btn btn--tonal btn--sm">Report issue</button>');
    expect(buttonClass("plain", "lg")).toBe("btn btn--plain btn--lg");
    expect(buttonClass("destructive")).toBe("btn btn--destructive");
  });

  it("keeps its width while busy: the label stays (hidden) and the busy label overlays it", () => {
    const html = r(<Button variant="primary" busy busyLabel="Saving">Looks correct</Button>);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('<span class="hold" aria-hidden="true">Looks correct</span>');
    expect(html).toContain('<span class="busy"><span class="btn-spinner" aria-hidden="true"></span>Saving</span>');
    expect(html).not.toContain("aria-disabled");
  });
});

describe("Banner", () => {
  it("renders title, body and one action with the tone class", () => {
    expect(r(<Banner tone="crit" role="note" title="Couldn't sign you in." body="Nothing changed."
      action={<Button variant="tonal" size="sm">Retry check</Button>} />)).toBe(
      '<div class="banner banner--crit" role="note"><p class="banner-title">Couldn&#x27;t sign you in.</p>' +
      '<p class="banner-body">Nothing changed.</p><span class="banner-action"><button type="button" class="btn btn--tonal btn--sm">Retry check</button></span></div>');
  });
  it("omits the body when there is none", () => {
    expect(r(<Banner tone="warn" title="Too many sign-in attempts." />))
      .toBe('<div class="banner banner--warn"><p class="banner-title">Too many sign-in attempts.</p></div>');
  });
});

describe("Field", () => {
  it("links the error to the control with aria-invalid and aria-describedby", () => {
    const html = r(<Field id="note" label="Note" control={<textarea className="textarea" />} error="Add at least 5 characters." counter="4 / 1000" />);
    expect(html).toContain('<label class="field-label" for="note">Note</label>');
    expect(html).toContain('<textarea class="textarea" id="note" aria-invalid="true" aria-describedby="note-meta"></textarea>');
    expect(html).toContain('<div class="field-meta" id="note-meta"><span class="field-error">Add at least 5 characters.</span><span class="field-count">4 / 1000</span></div>');
  });
  it("has no meta block and no aria-describedby without help, error or counter", () => {
    const html = r(<Field id="q" label="Search" control={<input className="input" />} />);
    expect(html).not.toContain("field-meta");
    expect(html).not.toContain("aria-describedby");
    expect(html).not.toContain("aria-invalid");
  });
});

describe("Segmented", () => {
  it("is a labelled group of aria-pressed buttons; with a name they submit their value", () => {
    const html = r(<Segmented ariaLabel="Colour theme" name="theme" value="dark"
      options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />);
    expect(html).toBe('<div class="seg" role="group" aria-label="Colour theme">' +
      '<button type="submit" value="system" aria-pressed="false" name="theme">System</button>' +
      '<button type="submit" value="light" aria-pressed="false" name="theme">Light</button>' +
      '<button type="submit" value="dark" aria-pressed="true" name="theme">Dark</button></div>');
  });
});

describe("ProgressMeter", () => {
  it("is role=img with the worded label and custom-property widths only", () => {
    const html = r(<ProgressMeter approved={4} issue={1} total={10} />);
    expect(html).toContain('class="prog" role="img" aria-label="4 of 10 approved by a pharmacist, 1 with an issue reported"');
    expect(html).toContain('<i class="p-ok bar" style="--w:40%"></i><i class="p-issue bar" style="--w:10%"></i>');
  });
  it("shows 0% for an empty batch", () => {
    expect(r(<ProgressMeter approved={0} issue={0} total={0} />)).toContain('style="--w:0%"');
  });
  it("the batch card's wide meter carries its own label", () => {
    expect(r(<ProgressMeter approved={1} issue={2} total={10} wide label="1 approved, 2 with an issue, 7 need review" />))
      .toContain('class="prog prog--wide" role="img" aria-label="1 approved, 2 with an issue, 7 need review"');
  });
});

describe("BotCheck and ExampleMarker", () => {
  it.each([["passed", "Bot check passed", 'class="botcheck"'], ["checking", "Checking", 'class="botcheck"'],
    ["failed", "Bot check failed", 'class="botcheck is-failed failed"']] as const)("%s", (state, word, cls) => {
    expect(r(<BotCheck state={state} />)).toBe(`<span ${cls}>${word}</span>`);
  });
  it("ExampleMarker says Example", () => {
    expect(r(<ExampleMarker />)).toBe('<span class="example">Example</span>');
  });
});
