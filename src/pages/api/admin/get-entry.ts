import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  const id = typeof req.query.id === "string" ? req.query.id : null;
  if (!id) return res.status(400).json({ error: "Missing id" });

  const { data: ts, error: tsErr } = await supabaseServer
    .from("timesheets")
    .select("id, created_at, work_date, worker_name, job_type, job_text_raw, job_text_clean, total_hours, notes")
    .eq("id", id)
    .single();

  if (tsErr || !ts) return res.status(404).json({ error: "Not found" });

  const { data: equip } = await supabaseServer
    .from("equipment_entries")
    .select("id, equipment, attachment, hours, notes, trucking_hours, trucking_notes")
    .eq("timesheet_id", id)
    .order("id", { ascending: true });

  const { data: mats } = await supabaseServer
    .from("material_entries")
    .select("id, material, loads, notes")
    .eq("timesheet_id", id)
    .order("id", { ascending: true });

  const { data: photos } = await supabaseServer
    .from("photo_entries")
    .select("id, path, filename, created_at")
    .eq("timesheet_id", id)
    .order("created_at", { ascending: true });

  return res.status(200).json({ timesheet: ts, equipment: equip || [], materials: mats || [], photos: photos || [] });
}
