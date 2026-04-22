import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "../../../../lib/adminAuth";
import { supabaseServer } from "../../../../lib/supabaseServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const authErr = requireAdmin(req);
  if (authErr) return res.status(401).json({ error: authErr });
  const { id, active } = req.body || {};
  const empId = Number(id);
  if (!empId || typeof active !== "boolean") return res.status(400).json({ error: "Missing id/active" });

  const { error } = await supabaseServer.from("employees").update({ active }).eq("id", empId);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true });
}
