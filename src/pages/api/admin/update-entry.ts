import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body || {};
  const id: string | undefined = body.id;
  if (!id) return res.status(400).json({ error: "Missing id" });

  const patch = body.patch || {};
  const equipment = Array.isArray(body.equipment) ? body.equipment : [];
  const materials = Array.isArray(body.materials) ? body.materials : [];

  // Update timesheet core fields
  const tsUpdate: any = {};
  if (typeof patch.worker_name === "string") tsUpdate.worker_name = patch.worker_name;
  if (typeof patch.work_date === "string") tsUpdate.work_date = patch.work_date;
  if (typeof patch.job_type === "string") tsUpdate.job_type = patch.job_type;
  if (typeof patch.job_text_clean === "string") tsUpdate.job_text_clean = patch.job_text_clean;
  if (typeof patch.total_hours === "number") tsUpdate.total_hours = patch.total_hours;
  if (typeof patch.notes === "string" || patch.notes === null) tsUpdate.notes = patch.notes;

  if (Object.keys(tsUpdate).length) {
    const { error } = await supabaseServer.from("timesheets").update(tsUpdate).eq("id", id);
    if (error) return res.status(500).json({ error: "Failed to update timesheet" });
  }

  // Replace equipment/materials (delete then insert)
  const { error: de1 } = await supabaseServer.from("equipment_entries").delete().eq("timesheet_id", id);
  if (de1) return res.status(500).json({ error: "Failed to update equipment (delete)" });

  const { error: de2 } = await supabaseServer.from("material_entries").delete().eq("timesheet_id", id);
  if (de2) return res.status(500).json({ error: "Failed to update materials (delete)" });

  const eqPayload = equipment
    .filter((r: any) => (r?.equipment || "").trim())
    .map((r: any) => ({
      timesheet_id: id,
      equipment: String(r.equipment),
      attachment: r.attachment ? String(r.attachment) : null,
      hours: r.equipment === "Dump Truck" ? null : (r.hours ?? null),
      notes: r.equipment === "Dump Truck" ? null : (r.notes ?? null),
      trucking_hours: r.equipment === "Dump Truck" ? (r.trucking_hours ?? null) : null,
      trucking_notes: r.equipment === "Dump Truck" ? (r.trucking_notes ?? null) : null,
    }));

  if (eqPayload.length) {
    const { error } = await supabaseServer.from("equipment_entries").insert(eqPayload);
    if (error) return res.status(500).json({ error: "Failed to update equipment (insert)" });
  }

  const matPayload = materials
    .filter((r: any) => (r?.material || "").trim())
    .map((r: any) => ({
      timesheet_id: id,
      material: String(r.material),
      loads: Number(r.loads ?? 0),
      notes: r.notes ?? null,
    }))
    .filter((r: any) => !Number.isNaN(r.loads));

  if (matPayload.length) {
    const { error } = await supabaseServer.from("material_entries").insert(matPayload);
    if (error) return res.status(500).json({ error: "Failed to update materials (insert)" });
  }

  return res.status(200).json({ ok: true });
}
