import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "../../../../lib/adminAuth";
import { supabaseServer } from "../../../../lib/supabaseServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authErr = requireAdmin(req);
  if (authErr) return res.status(401).json({ error: authErr });

  const pinRaw = (req.query.pin ?? "") as string;
  const pin = String(pinRaw).trim();
  if (!pin) return res.status(400).json({ error: "Missing PIN" });

  const { data, error } = await supabaseServer
    .from("employees")
    .select("id,name,pin,active")
    .eq("pin", pin)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "PIN not found" });

  return res.status(200).json({ ok: true, employee: data });
}
