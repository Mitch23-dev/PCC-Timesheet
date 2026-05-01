import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseCookies, verifySession } from "@/lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySession(cookies.pcc_session);
  if (!session) return res.status(401).json({ error: "Not signed in" });
  const empId = Number(session.employee_id);
  if (!Number.isFinite(empId)) return res.status(401).json({ error: "Invalid session" });

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) return res.status(400).json({ error: "Missing id" });

  const { data: timesheet, error: tsErr } = await supabaseServer
    .from("timesheets")
    .select("*")
    .eq("id", id)
    .eq("employee_id", empId)
    .single();

  if (tsErr || !timesheet) return res.status(404).json({ error: "Not found" });

  const [equip, mats, photos] = await Promise.all([
    supabaseServer.from("equipment_entries").select("*").eq("timesheet_id", id).order("id", { ascending: true }),
    supabaseServer.from("material_entries").select("*").eq("timesheet_id", id).order("id", { ascending: true }),
    supabaseServer.from("photo_entries").select("*").eq("timesheet_id", id).order("created_at", { ascending: true }),
  ]);

  if (equip.error || mats.error || photos.error)
    return res.status(500).json({ error: "Failed to load details" });

  return res.status(200).json({ timesheet, equipment: equip.data || [], materials: mats.data || [], photos: photos.data || [] });
}
