import React from "react";

type EmployeeTab = "entry" | "my";

export default function EmployeeTabs({ active }: { active: EmployeeTab }) {
  return (
    <div className="tabbar">
      <a href="/" className={active === "entry" ? "tab tab-active" : "tab"}>
        <span className="tabIcon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              d="M4 7h16M7 4v16M17 4v16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M9 10h6M9 13h6M9 16h4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="tabLabel">Timesheet</span>
      </a>

      <a href="/my" className={active === "my" ? "tab tab-active" : "tab"}>
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
        <span className="tabLabel">My Timesheets</span>
      </a>
    </div>
  );
}
