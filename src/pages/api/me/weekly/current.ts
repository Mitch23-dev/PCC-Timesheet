import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseCookies, verifySession } from "@/lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySession(cookies.pcc_session);
  if (!session) return res.status(401).json({ error: "Not signed in" });
  const empId = Number(session.employee_id);
  if (!Number.isFinite(empId)) return res.status(401).json({ error: "Invalid session" });

  const weekStart = typeof req.query.weekStart === "string" ? req.query.weekStart : "";
  const type = typeof req.query.type === "string" ? req.query.type : "management";
  if (!weekStart) return res.status(400).json({ error: "Missing weekStart" });

  const { data: sheet, error } = await supabaseServer
    .from("weekly_timesheets")
    .select("id, week_start, status, submitted_at, total_hours")
    .eq("employee_id", empId)
    .eq("week_start", weekStart)
    .eq("timesheet_type", type)
    .maybeSingle();

  if (error) return res.status(500).json({ error: "Failed to load week" });
  if (!sheet) return res.status(200).json({ sheet: null });

  const { data: entries, error: entErr } = await supabaseServer
    .from("weekly_timesheet_entries")
.select("id, entry_date, start_time, end_time, hours, job_label, equipment_label, attachment_label, description, sort_order")
    .eq("weekly_timesheet_id", sheet.id)
    .order("sort_order", { ascending: true });

  if (entErr) return res.status(500).json({ error: "Failed to load entries" });
  return res.status(200).json({ sheet: { ...sheet, entries: entries || [] } });
}
