import React from "react";

type AdminTab = "timesheets" | "estimating" | "quotes" | "activeJobs" | "completedJobs" | "projectMetrics" | "employees" | "settings" | "rates";

export default function AdminTabs({ active }: { active: AdminTab }) {
  return (
    <div className="tabbar">
      <a href="/admin" className={active === "timesheets" ? "tab tab-active" : "tab"}>
        <span className="tabIcon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M7 3h10a2 2 0 0 1 2 2v16l-4-2-4 2-4-2-4 2V5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M9 8h6M9 12h6M9 16h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="tabLabel">Timesheets</span>
      </a>


      <a href="/admin/estimating" className={active === "estimating" ? "tab tab-active" : "tab"}>
        <span className="tabIcon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M5 5h14v14H5z" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M9 9h6M9 13h6M9 17h3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="tabLabel">Estimating</span>
      </a>

      <a href="/admin/quotes" className={active === "quotes" ? "tab tab-active" : "tab"}>
        <span className="tabIcon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M4 7h16v10H4z" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M8 11h8M8 15h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="tabLabel">Quotes</span>
      </a>

      <a href="/admin/active-jobs" className={active === "activeJobs" ? "tab tab-active" : "tab"}>
        <span className="tabIcon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M4 12h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M12 4v16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="tabLabel">Active Jobs</span>
      </a>

      <a href="/admin/completed-jobs" className={active === "completedJobs" ? "tab tab-active" : "tab"}>
        <span className="tabIcon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M5 12l4 4L19 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="tabLabel">Completed Jobs</span>
      </a>

      <a href="/admin/project-metrics" className={active === "projectMetrics" ? "tab tab-active" : "tab"}>
        <span className="tabIcon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M4 20h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M7 16v-5M12 16V8M17 16V5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="tabLabel">Project Metrics</span>
      </a>
      <a href="/admin/employees" className={active === "employees" ? "tab tab-active" : "tab"}>
        <span className="tabIcon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M16 11a4 4 0 1 0-8 0" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M6 21a6 6 0 0 1 12 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="tabLabel">Employees</span>
      </a>

      <a href="/admin/timesheet-settings" className={active === "settings" ? "tab tab-active" : "tab"}>
        <span className="tabIcon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M12 3l2.2 2.2 3.1-.5.8 3 2.7 1.7-1.7 2.7 1.7 2.7-2.7 1.7-.8 3-3.1-.5L12 21l-2.2-2.2-3.1.5-.8-3-2.7-1.7 1.7-2.7-1.7-2.7 2.7-1.7.8-3 3.1.5L12 3z" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </span>
        <span className="tabLabel">Resources</span>
      </a>

      <a href="/admin/rates" className={active === "rates" ? "tab tab-active" : "tab"}>
        <span className="tabIcon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M4 19h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M7 16V9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M12 16V5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M17 16v-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="tabLabel">Rates</span>
      </a>
    </div>
  );
}
