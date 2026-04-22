import React from "react";
import PageHeader from "./ui/PageHeader";
import AdminTabs from "./AdminTabs";

type AdminTab = "timesheets" | "estimating" | "quotes" | "activeJobs" | "completedJobs" | "projectMetrics" | "employees" | "settings" | "rates";

export default function AdminPageShell({
  active,
  title,
  subtitle,
  onSignOut,
  children,
}: {
  active: AdminTab;
  title: string;
  subtitle: string;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="admin-shell">
      <PageHeader
        title="PCC Timesheet Admin"
        subtitle={subtitle}
        actions={<button className="btn btn-ghost" onClick={onSignOut}>Sign out</button>}
      />
      <div className="tabcard">
        <AdminTabs active={active} />
        <section className="card tabcard-body project-shell">
          <div className="project-page-header">
            <div>
              <div className="subtle" style={{ textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 900 }}>Admin</div>
              <h2 className="h1" style={{ margin: "6px 0 4px" }}>{title}</h2>
              <div className="subtle">{subtitle}</div>
            </div>
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}
