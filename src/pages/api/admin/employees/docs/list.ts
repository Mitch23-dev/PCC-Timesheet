import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  const employee_id = typeof req.query.employee_id === "string" ? Number(req.query.employee_id) : NaN;
  if (!employee_id || Number.isNaN(employee_id)) return res.status(400).json({ error: "Missing employee_id" });

  const { data, error } = await supabaseServer
    .from("employee_documents")
    .select("id, employee_id, file_name, file_path, doc_type, created_at")
    .eq("employee_id", employee_id)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ rows: data || [] });
}
