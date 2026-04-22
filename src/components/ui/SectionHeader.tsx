import React from "react";

export default function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="ui-section-header">
      <div>
        <h2 className="ui-section-title">{title}</h2>
        {subtitle ? <div className="subtle">{subtitle}</div> : null}
      </div>
      {actions ? <div className="ui-section-actions">{actions}</div> : null}
    </div>
  );
}
