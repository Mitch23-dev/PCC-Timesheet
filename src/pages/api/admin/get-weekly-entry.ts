import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  const id = typeof req.query.id === "string" ? req.query.id : null;
  if (!id) return res.status(400).json({ error: "Missing id" });

  const { data: sheet, error: sheetErr } = await supabaseServer
    .from("weekly_timesheets")
    .select("id, employee_id, employee_name, week_start, timesheet_type, status, total_hours, created_at, updated_at, submitted_at")
    .eq("id", id)
    .single();

  if (sheetErr || !sheet) return res.status(404).json({ error: "Weekly timesheet not found" });

  const { data: entries, error: entryErr } = await supabaseServer
    .from("weekly_timesheet_entries")
    .select("id, entry_date, start_time, end_time, hours, job_label, equipment_label, attachment_label, description, sort_order")
    .eq("weekly_timesheet_id", id)
    .order("entry_date", { ascending: true })
    .order("sort_order", { ascending: true });

  if (entryErr) return res.status(500).json({ error: "Failed to load weekly entries" });

  return res.status(200).json({ sheet, entries: entries || [] });
}
