/* The small set of shared controls. Deliberately small: the app has one real
 * interaction (log a day) and everything else is a form field. */

import { useEffect, useRef, type ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "solid" | "outline" | "quiet" | "danger";
  disabled?: boolean;
  full?: boolean;
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "outline",
  disabled,
  full,
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn--${variant}${full ? " btn--full" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={`segmented__option${option.value === value ? " is-on" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface SwitchProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Switch({ label, hint, checked, onChange }: SwitchProps) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch__track" aria-hidden="true">
        <span className="switch__knob" />
      </span>
      <span className="switch__text">
        <span>{label}</span>
        {hint ? <span className="field__hint">{hint}</span> : null}
      </span>
    </label>
  );
}

interface SheetProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

/** A bottom sheet on a phone, a centred panel on a desktop.
 *
 * Every edit in the app happens in one of these rather than on its own route,
 * so logging a day never loses your place.
 */
export function Sheet({ title, subtitle, onClose, children }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // Focus the panel so a keyboard user lands inside the sheet, and stop the
    // page behind it scrolling under the overlay.
    panel.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="sheet" role="presentation" onClick={onClose}>
      <div
        className="sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet__head">
          <div>
            <h2 className="sheet__title">{title}</h2>
            {subtitle ? <p className="sheet__subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" className="sheet__close" onClick={onClose} aria-label="Close">
            <Glyph name="close" />
          </button>
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  );
}

export function Notice({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "info" }) {
  return (
    <p className={`notice notice--${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="sr">{label}</span>
    </div>
  );
}

/* Icons are drawn inline rather than pulled from a pack: the app needs five of
 * them, and five hand-set strokes weigh less than a dependency and match the
 * rule weight used everywhere else. */

type GlyphName = "close" | "back" | "today" | "chart" | "gear" | "plus" | "check";

const PATHS: Record<GlyphName, string> = {
  close: "M5 5l10 10M15 5L5 15",
  back: "M12 4l-7 6 7 6",
  today: "M4 7h12M4 7v8a1 1 0 001 1h10a1 1 0 001-1V7M4 7l1-3h10l1 3M7 11h2",
  chart: "M4 16V9M8 16V5M12 16v-5M16 16v-8",
  gear: "M10 7.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM10 3v2M10 15v2M3 10h2M15 10h2M5.2 5.2l1.4 1.4M13.4 13.4l1.4 1.4M14.8 5.2l-1.4 1.4M6.6 13.4l-1.4 1.4",
  plus: "M10 4v12M4 10h12",
  check: "M4 10.5l4 4 8-9",
};

export function Glyph({ name, size = 20 }: { name: GlyphName; size?: number }) {
  return (
    <svg
      className="glyph"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
