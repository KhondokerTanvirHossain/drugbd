import { PUBLIC_NEW } from "@/lib/copy";
import { CHECK } from "@/lib/public-copy";

/** The "Add a medicine" field. Without JavaScript it is a text field with a "Find" submit (§4.4). Task 32 adds the combobox. */
export default function CheckerCombobox({ ids, max, q }: { ids: string[]; max: number; q: string }) {
  const atMax = ids.length >= max;
  return (
    <div className="field">
      <label className="field-label" htmlFor="cx-input" id="cx-label">{CHECK.fieldLabel}</label>
      <div className="search">
        <input type="text" id="cx-input" name="q" defaultValue={q} placeholder={CHECK.placeholder} autoComplete="off" aria-describedby="cx-help"
          aria-disabled={atMax ? "true" : undefined} readOnly={atMax || undefined} />
      </div>
      <div className="field-meta"><span id="cx-help">{atMax ? PUBLIC_NEW.checkerMax.help : CHECK.help}</span></div>
      <button type="submit" name="find" value="1" className="btn btn--tonal btn--sm">{PUBLIC_NEW.checker.find}</button>
    </div>
  );
}
