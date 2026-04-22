import React from "react";

export default function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="ui-page-header">
      <div className="ui-page-header-copy">
        <h1 className="h1">{title}</h1>
        {subtitle ? <p className="subtle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="ui-page-header-actions">{actions}</div> : null}
    </div>
  );
}
