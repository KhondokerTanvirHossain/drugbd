import { cloneElement, type ReactElement, type ReactNode } from "react";

/** §3.4 Field. Errors use aria-invalid="true" plus .field-error text linked through aria-describedby. */
export default function Field({ id, label, control, help, error, counter }:
    { id: string; label: ReactNode; control: ReactElement<Record<string, unknown>>; help?: ReactNode; error?: ReactNode; counter?: string }) {
  const hasMeta = help !== undefined || error !== undefined || counter !== undefined;
  const metaId = `${id}-meta`;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {cloneElement(control, {
        id,
        "aria-invalid": error !== undefined ? "true" : undefined,
        "aria-describedby": hasMeta ? metaId : undefined,
      })}
      {hasMeta && (
        <div className="field-meta" id={metaId}>
          {help !== undefined && <span>{help}</span>}
          {error !== undefined && <span className="field-error">{error}</span>}
          {counter !== undefined && <span className="field-count">{counter}</span>}
        </div>
      )}
    </div>
  );
}
