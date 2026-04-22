import React from "react";

export function FormField({
  label,
  children,
  className = "",
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`field ${className}`.trim()}>
      <div className="label">{label}</div>
      {children}
    </label>
  );
}

export function FormSection({
  title,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`ui-form-section ${className}`.trim()}>
      {title ? <h3 className="ui-form-section-title">{title}</h3> : null}
      {children}
    </section>
  );
}
