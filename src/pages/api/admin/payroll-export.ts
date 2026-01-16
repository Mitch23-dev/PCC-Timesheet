import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";

function csvEscape(v: any) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : null;
  const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : null;
  if (!dateFrom || !dateTo) return res.status(400).json({ error: "Missing dateFrom/dateTo" });

  // Pull timesheets in date range. We rely on work_date (YYYY-MM-DD).
  const q = supabaseServer
    .from("timesheets")
    .select("id, employee_id, worker_name, week_start, work_date, total_hours")
    .gte("work_date", dateFrom)
    .lte("work_date", dateTo);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  // Group by employee + week_start
  const map = new Map<string, { employee_id: number | null; employee_name: string; week_start: string | null; hours: number }>();
  for (const r of data || []) {
    const empId = (r as any).employee_id ?? null;
    const empName = (r as any).worker_name || "";
    const wk = (r as any).week_start ?? "";
    const key = `${empId ?? ""}__${wk}`;
    const hours = Number((r as any).total_hours || 0) || 0;
    const cur = map.get(key) || { employee_id: empId, employee_name: empName, week_start: wk, hours: 0 };
    cur.hours += hours;
    // prefer a name if present
    if (!cur.employee_name && empName) cur.employee_name = empName;
    map.set(key, cur);
  }

  const rows = Array.from(map.values()).sort((a, b) => {
    const wa = a.week_start || "";
    const wb = b.week_start || "";
    if (wa !== wb) return wa.localeCompare(wb);
    return (a.employee_name || "").localeCompare(b.employee_name || "");
  });

  const header = ["week_start", "employee_id", "employee_name", "total_hours"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([r.week_start || "", r.employee_id ?? "", r.employee_name || "", r.hours.toFixed(2)].map(csvEscape).join(","));
  }

  const csv = lines.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="payroll_${dateFrom}_to_${dateTo}.csv"`);
  return res.status(200).send(csv);
}
