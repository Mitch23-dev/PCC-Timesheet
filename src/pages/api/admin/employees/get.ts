import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const idRaw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const empId = typeof idRaw === "string" ? Number(idRaw) : Number(idRaw);
  if (!empId || Number.isNaN(empId)) return res.status(400).json({ error: "Missing employee id" });

  const { data, error } = await supabaseServer.from("employees").select("*").eq("id", empId).maybeSingle();
  if (error) return res.status(500).json({ error: "Failed to load employee" });
  if (!data) return res.status(404).json({ error: "Employee not found" });

  return res.status(200).json({ employee: data });
}
