import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  const id = typeof req.query.id === "string" ? Number(req.query.id) : NaN;
  if (!id || Number.isNaN(id)) return res.status(400).json({ error: "Missing id" });

  const row = await supabaseServer
    .from("employee_documents")
    .select("file_path, file_name")
    .eq("id", id)
    .single();

  if (row.error) return res.status(500).json({ error: row.error.message });
  const file_path = row.data?.file_path;
  const file_name = row.data?.file_name || "download";

  const dl = await supabaseServer.storage.from("employee-docs").download(file_path);
  if (dl.error) return res.status(500).json({ error: dl.error.message });

  const buf = Buffer.from(await dl.data.arrayBuffer());
  res.setHeader("Content-Disposition", `attachment; filename="${file_name}"`);
  res.setHeader("Content-Type", dl.data.type || "application/octet-stream");
  return res.status(200).send(buf);
}
