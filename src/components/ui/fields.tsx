"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Form controls.
 *
 * Every field is label-associated and describable, because financial input is
 * exactly where a screen reader user cannot afford to guess what a box wants.
 * Visually they are quiet: a thin border, no fill, and a focus ring that is
 * the only strong colour on the control.
 */

const CONTROL = cn(
  "w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink",
  "placeholder:text-ink-faint",
  "transition-all duration-150 ease-[var(--ease-out-soft)]",
  "hover:border-line-strong",
  "focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/12",
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-tertiary",
);

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label
          htmlFor={id}
          className="block text-[13px] font-medium text-ink-secondary"
        >
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12.5px] text-ink-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// `prefix` is a legacy HTML attribute typed as `string`; we shadow it with a
// ReactNode adornment, so it has to be omitted from the base props first.
export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
  /** Leading adornment, e.g. a ₹ glyph. */
  prefix?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    { label, hint, error, className, wrapperClassName, prefix, ...props },
    ref,
  ) {
    const generatedId = useId();
    const id = props.id ?? generatedId;

    return (
      <FieldShell
        id={id}
        label={label}
        hint={hint}
        error={error}
        className={wrapperClassName}
      >
        <div className="relative">
          {prefix && (
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-ink-tertiary">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={id}
            aria-invalid={error ? true : undefined}
            aria-describedby={
              error ? `${id}-error` : hint ? `${id}-hint` : undefined
            }
            className={cn(
              CONTROL,
              "h-11",
              prefix && "pl-8",
              error && "border-danger focus:border-danger focus:ring-danger/12",
              className,
            )}
            {...props}
          />
        </div>
      </FieldShell>
    );
  },
);

export interface SelectFieldProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  function SelectField(
    { label, hint, error, className, wrapperClassName, children, ...props },
    ref,
  ) {
    const generatedId = useId();
    const id = props.id ?? generatedId;

    return (
      <FieldShell
        id={id}
        label={label}
        hint={hint}
        error={error}
        className={wrapperClassName}
      >
        <div className="relative">
          <select
            ref={ref}
            id={id}
            aria-invalid={error ? true : undefined}
            className={cn(CONTROL, "h-11 appearance-none pr-9", className)}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary"
            strokeWidth={1.75}
          />
        </div>
      </FieldShell>
    );
  },
);

export interface TextAreaFieldProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

export const TextAreaField = forwardRef<
  HTMLTextAreaElement,
  TextAreaFieldProps
>(function TextAreaField(
  { label, hint, error, className, wrapperClassName, ...props },
  ref,
) {
  const generatedId = useId();
  const id = props.id ?? generatedId;

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      className={wrapperClassName}
    >
      <textarea
        ref={ref}
        id={id}
        rows={3}
        className={cn(CONTROL, "resize-none py-2.5 leading-relaxed", className)}
        {...props}
      />
    </FieldShell>
  );
});

/**
 * Rupee input.
 *
 * Accepts what people actually type — "2,400", "₹2400", "2.4k" — and reports
 * the parsed paise value upward. Uses `inputMode="decimal"` so phones show
 * the number pad without locking out shorthand.
 */
export const MoneyField = forwardRef<HTMLInputElement, TextFieldProps>(
  function MoneyField({ className, ...props }, ref) {
    return (
      <TextField
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        prefix="₹"
        className={cn("tnum", className)}
        {...props}
      />
    );
  },
);

/** Horizontal segmented control for small, mutually exclusive choices. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex w-full gap-1 rounded-xl bg-surface-sunken p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-[13px] font-medium",
              "transition-all duration-200 ease-[var(--ease-out-soft)]",
              selected
                ? "bg-surface text-ink shadow-[var(--shadow-subtle)]"
                : "text-ink-secondary hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
