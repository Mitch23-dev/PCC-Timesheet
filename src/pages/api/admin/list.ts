import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : null;
  const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : null;
  const employee = typeof req.query.employee === "string" ? req.query.employee : "All";
  const jobType = typeof req.query.jobType === "string" ? req.query.jobType : "All";
  const jobSearch = typeof req.query.jobSearch === "string" ? req.query.jobSearch.trim() : "";
  const sort = typeof req.query.sort === "string" ? req.query.sort : "work_date_desc";

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
  let photosByTs: Record<string, string[]> = {};

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

  const rows = (ts || []).map((r) => ({
    ...r,
    photo_paths: photosByTs[r.id] || [],
  }));

  return res.status(200).json({ rows });
}
