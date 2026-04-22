import React from "react";

export default function DataTable({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`ui-table-wrap ${className}`.trim()}>{children}</div>;
}
