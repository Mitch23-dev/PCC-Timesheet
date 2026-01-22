import React from "react";

type AdminTab = "timesheets" | "employees";

export default function AdminTabs({ active }: { active: AdminTab }) {
  return (
    <div className="tabbar">
      <a href="/admin" className={active === "timesheets" ? "tab tab-active" : "tab"}>
        <span className="tabIcon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              d="M7 3h10a2 2 0 0 1 2 2v16l-4-2-4 2-4-2-4 2V5a2 2 0 0 1 2-2z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M9 8h6M9 12h6M9 16h4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="tabLabel">Timesheets</span>
      </a>

      <a href="/admin/employees" className={active === "employees" ? "tab tab-active" : "tab"}>
        <span className="tabIcon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              d="M16 11a4 4 0 1 0-8 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M6 21a6 6 0 0 1 12 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="tabLabel">Employees</span>
      </a>
    </div>
  );
}
