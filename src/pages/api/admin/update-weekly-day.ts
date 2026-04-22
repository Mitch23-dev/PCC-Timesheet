import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/adminAuth";

function calcHours(start: string, end: string) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return 0;
  return Math.round((mins / 60) * 100) / 100;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body || {};
  const id = typeof body.id === "string" ? body.id : "";
  const entryDate = typeof body.entry_date === "string" ? body.entry_date : "";
  const timesheetType = body.timesheet_type === "mechanic" ? "mechanic" : "management";
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!id) return res.status(400).json({ error: "Missing weekly timesheet id" });
  if (!entryDate) return res.status(400).json({ error: "Missing entry date" });

  const normalized = rows.map((row: any, index: number) => ({ entry_date: entryDate, start_time: String(row.start_time || "").trim(), end_time: String(row.end_time || "").trim(), hours: calcHours(String(row.start_time || ""), String(row.end_time || "")), job_label: row.job_label ? String(row.job_label).trim() : null, equipment_label: row.equipment_label ? String(row.equipment_label).trim() : null, attachment_label: row.attachment_label ? String(row.attachment_label).trim() : null, description: row.description ? String(row.description).trim() : null, sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : index }));
  const hasAny = (row: any) => Boolean(row.start_time || row.end_time || row.hours > 0 || row.job_label || row.equipment_label || row.attachment_label || row.description);
  const complete = (row: any) => Boolean(row.entry_date && row.start_time && row.end_time && row.hours > 0 && (timesheetType === "mechanic" ? row.equipment_label : row.job_label) && row.description);
  const meaningful = normalized.filter(hasAny);
  const cleanRows = meaningful.filter(complete);
  if (meaningful.length !== cleanRows.length) return res.status(400).json({ error: "Complete or clear unfinished rows before saving this day." });

  const { error: delErr } = await supabaseServer.from("weekly_timesheet_entries").delete().eq("weekly_timesheet_id", id).eq("entry_date", entryDate);
  if (delErr) return res.status(500).json({ error: "Failed to clear existing day rows" });
  if (cleanRows.length) {
    const payload = cleanRows.map((row: any) => ({ ...row, weekly_timesheet_id: id }));
    const { error: insErr } = await supabaseServer.from("weekly_timesheet_entries").insert(payload);
    if (insErr) return res.status(500).json({ error: "Failed to save day rows" });
  }
  const { data: allRows, error: listErr } = await supabaseServer.from("weekly_timesheet_entries").select("hours").eq("weekly_timesheet_id", id);
  if (listErr) return res.status(500).json({ error: "Saved day, but failed to refresh totals" });
  const total_hours = (allRows || []).reduce((sum: number, row: any) => sum + Number(row.hours || 0), 0);
  const { error: updErr } = await supabaseServer.from("weekly_timesheets").update({ total_hours, updated_at: new Date().toISOString() }).eq("id", id);
  if (updErr) return res.status(500).json({ error: "Failed to update weekly total hours" });
  return res.status(200).json({ ok: true, total_hours });
}
