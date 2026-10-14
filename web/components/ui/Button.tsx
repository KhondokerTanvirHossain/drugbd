import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "tonal" | "plain" | "destructive";
export type ButtonSize = "sm" | "lg";

/** The class list for a button, also used for links that look like buttons. */
export function buttonClass(variant: ButtonVariant, size?: ButtonSize): string {
  return ["btn", `btn--${variant}`, size ? `btn--${size}` : ""].filter(Boolean).join(" ");
}

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant: ButtonVariant; size?: ButtonSize; busy?: boolean; busyLabel?: string; children: ReactNode;
  /** React 19 passes ref as a prop; islands use it to move focus (§10.1). */
  ref?: Ref<HTMLButtonElement>;
};

/** §3.4 Button. "Report issue" is tonal, never destructive. While busy it keeps its width and shows busyLabel. */
export default function Button({ variant, size, busy = false, busyLabel, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button {...rest} type={type} className={buttonClass(variant, size)} aria-busy={busy ? "true" : undefined}>
      {busy ? (
        <>
          <span className={styles.hold} aria-hidden="true">{children}</span>
          <span className={styles.busy}><span className="btn-spinner" aria-hidden="true" />{busyLabel}</span>
        </>
      ) : children}
    </button>
  );
}
