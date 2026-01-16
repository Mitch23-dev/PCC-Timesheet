import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseCookies, verifySession } from "@/lib/session";

type Equip = {
  equipment: string;
  attachment: string | null;
  hours: number | null;
  notes: string | null;
  trucking_hours: number | null;
  trucking_notes: string | null;
};

type Mat = {
  material: string;
  loads: number;
  notes: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const cookies = parseCookies(req.headers.cookie);
  const session = verifySession(cookies.pcc_session);
  if (!session) return res.status(401).json({ error: "Not signed in" });
  const empId = Number(session.employee_id);
  if (!Number.isFinite(empId)) return res.status(401).json({ error: "Invalid session" });

  const { id, patch, equipment, materials } = req.body || {};
  if (!id || typeof id !== "string") return res.status(400).json({ error: "Missing id" });

  const { data: ts, error: tsErr } = await supabaseServer
    .from("timesheets")
    .select("id, employee_id, locked")
    .eq("id", id)
    .eq("employee_id", empId)
    .single();

  if (tsErr || !ts) return res.status(404).json({ error: "Not found" });
  if (ts.locked) return res.status(403).json({ error: "This pay period is locked" });

  // Update timesheet header fields (limited)
  const allowedPatch: any = {};
  for (const k of ["work_date", "job_type", "job_text_clean", "job_text_raw", "total_hours", "notes"]) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, k)) allowedPatch[k] = patch[k];
  }

  // Recalculate week_start if work_date changed
  if (allowedPatch.work_date) {
    const wd = new Date(String(allowedPatch.work_date) + "T00:00:00Z");
    const dow = wd.getUTCDay();
    const diff = (dow - 4 + 7) % 7;
    const weekStart = new Date(wd);
    weekStart.setUTCDate(wd.getUTCDate() - diff);
    allowedPatch.week_start = weekStart.toISOString().slice(0, 10);
  }

  if (Object.keys(allowedPatch).length) {
    const { error } = await supabaseServer.from("timesheets").update(allowedPatch).eq("id", id);
    if (error) return res.status(500).json({ error: "Failed to update timesheet" });
  }

  // Replace equipment/material rows (simple + reliable)
  const equipRows: Equip[] = Array.isArray(equipment) ? equipment : [];
  const matRows: Mat[] = Array.isArray(materials) ? materials : [];

  const del1 = await supabaseServer.from("equipment_entries").delete().eq("timesheet_id", id);
  if (del1.error) return res.status(500).json({ error: "Failed to update equipment" });
  const del2 = await supabaseServer.from("material_entries").delete().eq("timesheet_id", id);
  if (del2.error) return res.status(500).json({ error: "Failed to update materials" });

  const equipPayload = equipRows
    .filter((e) => (e?.equipment || "").trim())
    .map((e) => ({
      timesheet_id: id,
      equipment: e.equipment,
      attachment: e.attachment || null,
      hours: e.hours ?? null,
      notes: e.notes ?? null,
      trucking_hours: e.trucking_hours ?? null,
      trucking_notes: e.trucking_notes ?? null,
    }));

  const matPayload = matRows
    .map((m) => ({
      timesheet_id: id,
      material: String(m.material || "").trim(),
      loads: Number(m.loads || 0),
      notes: m.notes ?? null,
    }))
    .filter((m) => m.material && !Number.isNaN(m.loads) && m.loads !== 0);

  if (equipPayload.length) {
    const ins = await supabaseServer.from("equipment_entries").insert(equipPayload);
    if (ins.error) return res.status(500).json({ error: "Failed to save equipment" });
  }
  if (matPayload.length) {
    const ins = await supabaseServer.from("material_entries").insert(matPayload);
    if (ins.error) return res.status(500).json({ error: "Failed to save materials" });
  }

  return res.status(200).json({ ok: true });
}
