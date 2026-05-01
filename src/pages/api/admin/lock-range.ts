import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ ok: false, error: err });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const { dateFrom, dateTo, locked } = req.body || {};
  if (!dateFrom || !dateTo) return res.status(400).json({ ok: false, error: "Missing date range" });
  if (typeof locked !== "boolean") return res.status(400).json({ ok: false, error: "Missing locked" });

  const { error } = await supabaseServer
    .from("timesheets")
    .update({ locked })
    .gte("work_date", String(dateFrom))
    .lte("work_date", String(dateTo));

  if (error) return res.status(500).json({ ok: false, error: "Failed to update lock status" });
  return res.status(200).json({ ok: true });
}
