import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/adminAuth";

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  const body = (req.body && typeof req.body === "object") ? req.body : {};
  const dateFrom = (typeof body.dateFrom === "string" ? body.dateFrom : (typeof req.query.dateFrom === "string" ? req.query.dateFrom : null));
  const dateTo = (typeof body.dateTo === "string" ? body.dateTo : (typeof req.query.dateTo === "string" ? req.query.dateTo : null));
  const employee = (typeof body.employee === "string" ? body.employee : (typeof req.query.employee === "string" ? req.query.employee : "All"));
  const jobType = (typeof body.jobType === "string" ? body.jobType : (typeof req.query.jobType === "string" ? req.query.jobType : "All"));
  const jobSearch = (typeof body.jobSearch === "string" ? body.jobSearch.trim() : (typeof req.query.jobSearch === "string" ? req.query.jobSearch.trim() : ""));
  const sort = (typeof body.sort === "string" ? body.sort : (typeof req.query.sort === "string" ? req.query.sort : "work_date_desc"));

  let q = supabaseServer
    .from("timesheets")
    .select("id, created_at, work_date, week_start, worker_name, job_type, job_text_raw, job_text_clean, total_hours, notes, locked")
    .limit(500);

  if (dateFrom) q = q.gte("work_date", dateFrom);
  if (dateTo) q = q.lte("work_date", dateTo);
  if (employee && employee !== "All") q = q.eq("worker_name", employee);
  if (jobType && jobType !== "All") q = q.eq("job_type", jobType);
  if (jobSearch) q = q.ilike("job_text_clean", `%${jobSearch}%`);

  if (sort === "work_date_asc") q = q.order("work_date", { ascending: true });
  else if (sort === "employee_asc") q = q.order("worker_name", { ascending: true }).order("work_date", { ascending: true });
  else q = q.order("work_date", { ascending: false });

  const { data: ts, error: tsErr } = await q;
  if (tsErr) return res.status(500).json({ error: "Failed to load" });

  const ids = (ts || []).map((r) => r.id);
  const photosByTs: Record<string, string[]> = {};

  if (ids.length) {
    const { data: photos } = await supabaseServer
      .from("photo_entries")
      .select("timesheet_id, path, created_at")
      .in("timesheet_id", ids)
      .order("created_at", { ascending: true });

    for (const p of photos || []) {
      if (!photosByTs[p.timesheet_id]) photosByTs[p.timesheet_id] = [];
      if (photosByTs[p.timesheet_id].length < 10) photosByTs[p.timesheet_id].push(p.path);
    }
  }

  const standardRows = (ts || []).map((r) => ({
    id: r.id,
    record_kind: "standard",
    created_at: r.created_at,
    work_date: r.work_date,
    week_start: r.week_start,
    week_end: r.week_start ? addDaysISO(String(r.week_start), 6) : null,
    worker_name: r.worker_name,
    type: r.job_type,
    job_text_raw: r.job_text_raw,
    job_text_clean: r.job_text_clean,
    total_hours: r.total_hours,
    notes: r.notes,
    locked: r.locked,
    slip_paths: photosByTs[r.id] || [],
  }));

  let weeklyQ = supabaseServer
    .from("weekly_timesheets")
    .select("id, created_at, updated_at, employee_name, week_start, timesheet_type, status, total_hours")
    .limit(500)
    .order("week_start", { ascending: false });

  if (employee && employee !== "All") weeklyQ = weeklyQ.eq("employee_name", employee);
  if (jobType && jobType !== "All") {
    const lowered = String(jobType).toLowerCase();
    if (lowered.includes("management")) weeklyQ = weeklyQ.eq("timesheet_type", "management");
    else if (lowered.includes("mechanic")) weeklyQ = weeklyQ.eq("timesheet_type", "mechanic");
    else weeklyQ = weeklyQ.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  const { data: weeklySheets, error: weeklyErr } = await weeklyQ;
  if (weeklyErr) return res.status(500).json({ error: "Failed to load weekly timesheets" });

  const weeklyIds = (weeklySheets || []).map((r: any) => r.id);
  const entryCounts: Record<string, number> = {};
  const previewBySheet: Record<string, string> = {};
  if (weeklyIds.length) {
    const { data: weeklyEntries } = await supabaseServer
      .from("weekly_timesheet_entries")
      .select("weekly_timesheet_id, entry_date, start_time, end_time, hours, job_label, equipment_label, attachment_label, description, sort_order")
      .in("weekly_timesheet_id", weeklyIds)
      .order("entry_date", { ascending: true })
      .order("sort_order", { ascending: true });

    const seenPreview = new Set<string>();
    for (const row of weeklyEntries || []) {
      const key = String(row.weekly_timesheet_id);
      entryCounts[key] = (entryCounts[key] || 0) + 1;
      if (!seenPreview.has(key)) {
        const main = String(row.job_label || row.equipment_label || "").trim();
        const attachment = String(row.attachment_label || "").trim();
        const desc = String(row.description || "").trim();
        previewBySheet[key] = main || attachment || desc || "Weekly grid timesheet";
        seenPreview.add(key);
      }
    }
  }

  const weeklyRows = (weeklySheets || [])
    .map((r: any) => ({
      id: r.id,
      record_kind: "weekly",
      created_at: r.updated_at || r.created_at,
      work_date: r.week_start,
      week_start: r.week_start,
      week_end: addDaysISO(String(r.week_start), 6),
      worker_name: r.employee_name,
      type: r.timesheet_type === "mechanic" ? "Mechanic Grid" : "Management Grid",
      weekly_type: r.timesheet_type,
      weekly_status: r.status,
      job_text_raw: previewBySheet[r.id] || "Weekly grid timesheet",
      job_text_clean: previewBySheet[r.id] || "Weekly grid timesheet",
      total_hours: r.total_hours,
      notes: `${r.status === "submitted" ? "Submitted" : "Draft"} • ${entryCounts[r.id] || 0} entries`,
      locked: false,
      slip_paths: [],
      entry_count: entryCounts[r.id] || 0,
    }))
    .filter((r: any) => {
      if (dateFrom && r.week_end < dateFrom) return false;
      if (dateTo && r.week_start > dateTo) return false;
      if (jobSearch) {
        const hay = `${r.job_text_clean} ${r.notes} ${r.type}`.toLowerCase();
        if (!hay.includes(jobSearch.toLowerCase())) return false;
      }
      return true;
    });

  const rows = [...standardRows, ...weeklyRows].sort((a: any, b: any) => {
    if (sort === "work_date_asc") return String(a.work_date).localeCompare(String(b.work_date));
    if (sort === "employee_asc") {
      const byEmp = String(a.worker_name || "").localeCompare(String(b.worker_name || ""));
      if (byEmp !== 0) return byEmp;
      return String(a.work_date).localeCompare(String(b.work_date));
    }
    return String(b.work_date).localeCompare(String(a.work_date));
  });

  return res.status(200).json({ rows });
}
