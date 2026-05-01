import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseCookies, verifySession } from "@/lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySession(cookies.pcc_session);
  if (!session) return res.status(401).json({ error: "Not signed in" });
  const empId = Number(session.employee_id);
  if (!Number.isFinite(empId)) return res.status(401).json({ error: "Invalid session" });

  const { week_start, type, status, rows } = req.body || {};
  if (typeof week_start !== "string" || !week_start) return res.status(400).json({ error: "Missing week_start" });
  if (type !== "management" && type !== "mechanic") return res.status(400).json({ error: "Invalid timesheet type" });
  if (status !== "draft" && status !== "submitted") return res.status(400).json({ error: "Invalid status" });
  if (!Array.isArray(rows)) return res.status(400).json({ error: "Rows are required" });

  const normalizedRows = rows.map((row: any, index: number) => ({
    entry_date: String(row.entry_date || "").trim(),
    start_time: String(row.start_time || "").trim(),
    end_time: String(row.end_time || "").trim(),
    hours: Number(row.hours || 0),
    job_label: row.job_label ? String(row.job_label).trim() : null,
    equipment_label: row.equipment_label ? String(row.equipment_label).trim() : null,
    attachment_label: row.attachment_label ? String(row.attachment_label).trim() : null,
    description: row.description ? String(row.description).trim() : null,
    sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : index,
  }));

  const hasAnyValue = (row: any) => {
    return Boolean(
      row.entry_date ||
      row.start_time ||
      row.end_time ||
      row.hours > 0 ||
      row.job_label ||
      row.equipment_label ||
      row.attachment_label ||
      row.description
    );
  };

  const isComplete = (row: any) => {
    const label = type === "mechanic" ? row.equipment_label : row.job_label;
    return Boolean(row.entry_date && row.start_time && row.end_time && row.hours > 0 && label && row.description);
  };

  const meaningfulRows = normalizedRows.filter(hasAnyValue);
  const cleanRows = meaningfulRows.filter(isComplete);

  if (status === "submitted") {
    if (!cleanRows.length) {
      return res.status(400).json({ error: "Add at least one complete row." });
    }
    const unfinishedRows = meaningfulRows.filter((row) => !isComplete(row));
    if (unfinishedRows.length) {
      return res.status(400).json({ error: "Complete or clear unfinished rows before submitting." });
    }
  }

  const total_hours = cleanRows.reduce((sum: number, row: any) => sum + Number(row.hours || 0), 0);

  const existing = await supabaseServer
    .from("weekly_timesheets")
    .select("id")
    .eq("employee_id", empId)
    .eq("week_start", week_start)
    .eq("timesheet_type", type)
    .maybeSingle();

  if (existing.error) return res.status(500).json({ error: "Failed to save week" });

  let sheetId = existing.data?.id as string | undefined;
  const now = new Date().toISOString();
  const parentPayload: any = {
    employee_id: empId,
    employee_name: session.employee_name,
    week_start,
    timesheet_type: type,
    status,
    total_hours,
    updated_at: now,
  };
  if (status === "submitted") parentPayload.submitted_at = now;

  if (!sheetId) {
    const ins = await supabaseServer.from("weekly_timesheets").insert(parentPayload).select("id").single();
    if (ins.error || !ins.data?.id) return res.status(500).json({ error: "Failed to create week" });
    sheetId = ins.data.id as string;
  } else {
    const upd = await supabaseServer.from("weekly_timesheets").update(parentPayload).eq("id", sheetId).select("id").single();
    if (upd.error) return res.status(500).json({ error: "Failed to update week" });
  }

  if (status === "submitted") {
    const forceSubmitted = await supabaseServer
      .from("weekly_timesheets")
      .update({ status: "submitted", submitted_at: now, updated_at: now, total_hours })
      .eq("id", sheetId)
      .select("id")
      .single();
    if (forceSubmitted.error) return res.status(500).json({ error: "Failed to submit week" });
  }

  const del = await supabaseServer.from("weekly_timesheet_entries").delete().eq("weekly_timesheet_id", sheetId);
  if (del.error) return res.status(500).json({ error: "Failed to update week entries" });

  if (cleanRows.length) {
    const payload = cleanRows.map((row: any) => ({ ...row, weekly_timesheet_id: sheetId }));
    const ins2 = await supabaseServer.from("weekly_timesheet_entries").insert(payload);
    if (ins2.error) return res.status(500).json({ error: "Failed to save week entries" });
  }

  const list = await supabaseServer
    .from("weekly_timesheet_entries")
    .select("id, entry_date, start_time, end_time, hours, job_label, equipment_label, attachment_label, description, sort_order")
    .eq("weekly_timesheet_id", sheetId)
    .order("sort_order", { ascending: true });

  if (list.error) return res.status(500).json({ error: "Saved week, but failed to reload entries" });
  return res.status(200).json({
    sheet: {
      id: sheetId,
      week_start,
      status,
      total_hours,
      entries: list.data || [],
    },
  });
}
