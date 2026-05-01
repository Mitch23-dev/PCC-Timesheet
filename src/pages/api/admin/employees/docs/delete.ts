import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { id, file_path } = req.body || {};
  if (!id) return res.status(400).json({ error: "Missing id" });

  if (file_path) {
    const del = await supabaseServer.storage.from("employee-docs").remove([String(file_path)]);
    if (del.error) return res.status(500).json({ error: del.error.message });
  }

  const db = await supabaseServer.from("employee_documents").delete().eq("id", id);
  if (db.error) return res.status(500).json({ error: db.error.message });

  return res.status(200).json({ ok: true });
}
