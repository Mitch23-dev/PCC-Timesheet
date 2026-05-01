import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).send(err);

  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const id = typeof req.body?.id === "string" ? req.body.id : null;
  if (!id) return res.status(400).send("Missing id");

  // Fetch photo paths so we can remove from storage bucket
  const { data: photos, error: photoSelErr } = await supabaseServer
    .from("photo_entries")
    .select("path")
    .eq("timesheet_id", id);

  if (photoSelErr) {
    // Not fatal; we can still proceed with deletes
  }

  // Delete children first (in case FK constraints exist)
  const { error: equipErr } = await supabaseServer.from("equipment_entries").delete().eq("timesheet_id", id);
  if (equipErr) return res.status(500).send(equipErr.message);

  const { error: matErr } = await supabaseServer.from("material_entries").delete().eq("timesheet_id", id);
  if (matErr) return res.status(500).send(matErr.message);

  const { error: photoErr } = await supabaseServer.from("photo_entries").delete().eq("timesheet_id", id);
  if (photoErr) return res.status(500).send(photoErr.message);

  const { error: tsErr } = await supabaseServer.from("timesheets").delete().eq("id", id);
  if (tsErr) return res.status(500).send(tsErr.message);

  // Best-effort: remove files from storage (ignore failures)
  const paths = (photos || []).map((p: any) => String(p.path || "")).filter(Boolean);
  if (paths.length) {
    try {
      await supabaseServer.storage.from("slips").remove(paths);
    } catch {
      // ignore
    }
  }

  return res.status(200).json({ ok: true });
}
