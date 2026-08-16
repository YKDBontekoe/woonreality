import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type FieldBase = {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  className?: string;
};

export function Field({
  label,
  htmlFor,
  hint,
  className = "",
  children,
}: FieldBase & { children: ReactNode }) {
  return (
    <label className={`ui-field ${className}`.trim()} htmlFor={htmlFor}>
      <span className="ui-field-label">{label}</span>
      {hint ? <span className="ui-field-hint">{hint}</span> : null}
      {children}
    </label>
  );
}

export function TextInput({
  label,
  htmlFor,
  hint,
  className,
  ...inputProps
}: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} htmlFor={htmlFor} hint={hint} className={className}>
      <input id={htmlFor} {...inputProps} />
    </Field>
  );
}

export function TextSelect({
  label,
  htmlFor,
  hint,
  className,
  children,
  ...selectProps
}: FieldBase & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <Field label={label} htmlFor={htmlFor} hint={hint} className={className}>
      <select id={htmlFor} {...selectProps}>
        {children}
      </select>
    </Field>
  );
}

export function TextTextarea({
  label,
  htmlFor,
  hint,
  className,
  ...textareaProps
}: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} htmlFor={htmlFor} hint={hint} className={className}>
      <textarea id={htmlFor} {...textareaProps} />
    </Field>
  );
}
