import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseCookies, verifySession } from "@/lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySession(cookies.pcc_session);
  if (!session) return res.status(401).json({ error: "Not signed in" });
  const empId = Number(session.employee_id);
  if (!Number.isFinite(empId)) return res.status(401).json({ error: "Invalid session" });

  const { data, error } = await supabaseServer
    .from("timesheets")
    .select("id, created_at, work_date, week_start, job_type, job_text_clean, job_text_raw, total_hours, notes, locked")
    .eq("employee_id", empId)
    .order("work_date", { ascending: false });

  if (error) return res.status(500).json({ error: "Failed to load timesheets" });
  return res.status(200).json({ rows: data || [] });
}
