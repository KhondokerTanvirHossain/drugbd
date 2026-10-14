import type { MouseEvent } from "react";

/** §3.4 Segmented (.seg): one choice at a time, aria-pressed. With `name`, each button submits its value. */
export default function Segmented<V extends string>({ ariaLabel, options, value, name, onSelect }: {
  ariaLabel: string; options: { value: V; label: string }[]; value: V; name?: string;
  onSelect?: (e: MouseEvent<HTMLButtonElement>, value: V) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type={name ? "submit" : "button"} name={name} value={name ? o.value : undefined}
          aria-pressed={o.value === value} onClick={onSelect ? (e) => onSelect(e, o.value) : undefined}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
