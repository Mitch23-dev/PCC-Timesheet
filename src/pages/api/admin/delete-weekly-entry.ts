import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const id = typeof req.body?.id === "string" ? req.body.id : null;
  if (!id) return res.status(400).json({ error: "Missing id" });

  const { error } = await supabaseServer.from("weekly_timesheets").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Failed to delete weekly timesheet" });

  return res.status(200).json({ ok: true });
}
