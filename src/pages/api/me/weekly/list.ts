import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseCookies, verifySession } from "@/lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySession(cookies.pcc_session);
  if (!session) return res.status(401).json({ error: "Not signed in" });
  const empId = Number(session.employee_id);
  if (!Number.isFinite(empId)) return res.status(401).json({ error: "Invalid session" });
  const type = typeof req.query.type === "string" ? req.query.type : "management";

  const { data: sheets, error } = await supabaseServer
    .from("weekly_timesheets")
    .select("id, week_start, status, total_hours, submitted_at, updated_at")
    .eq("employee_id", empId)
    .eq("timesheet_type", type)
    .order("week_start", { ascending: false });
  if (error) return res.status(500).json({ error: "Failed to load weekly timesheets" });

  const ids = (sheets || []).map((s: any) => s.id);
  let entriesBySheet: Record<string, any[]> = {};
  if (ids.length) {
    const { data: entries } = await supabaseServer
      .from("weekly_timesheet_entries")
.select("weekly_timesheet_id, entry_date, start_time, end_time, hours, job_label, equipment_label, attachment_label, description, sort_order")
      .in("weekly_timesheet_id", ids)
      .order("entry_date", { ascending: true })
      .order("sort_order", { ascending: true });
    for (const row of entries || []) {
      if (!entriesBySheet[row.weekly_timesheet_id]) entriesBySheet[row.weekly_timesheet_id] = [];
      entriesBySheet[row.weekly_timesheet_id].push(row);
    }
  }

  return res.status(200).json({ rows: (sheets || []).map((s: any) => ({ ...s, entries: entriesBySheet[s.id] || [] })) });
}
