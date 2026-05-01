import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "../../../lib/adminAuth";
import { supabaseServer } from "../../../lib/supabaseServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  const { data, error } = await supabaseServer
    .from("employees")
    .select("name, active")
    .order("name", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const names = (data || [])
    .filter((e: any) => e?.name && e?.active !== false)
    .map((e: any) => String(e.name));

  return res.status(200).json({ names });
}
