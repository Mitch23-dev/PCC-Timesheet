import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import formidable, { File } from "formidable";
import fs from "fs";

export const config = {
  api: { bodyParser: false },
};

function first<T>(v: T | T[] | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const form = formidable({ multiples: false });
  form.parse(req, async (parseErr, fields, files) => {
    if (parseErr) return res.status(400).json({ error: String(parseErr) });

    const employee_id_raw = first(fields.employee_id);
    const doc_type = (first(fields.doc_type) as string | undefined) || null;
    const employee_id = employee_id_raw ? Number(employee_id_raw) : NaN;
    const file = first(files.file) as File | undefined;

    if (!employee_id || Number.isNaN(employee_id)) return res.status(400).json({ error: "Missing employee_id" });
    if (!file) return res.status(400).json({ error: "Missing file" });

    const fileName = file.originalFilename || "upload.bin";
    const ext = fileName.includes(".") ? fileName.split(".").pop() : "bin";
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `employee_${employee_id}/${Date.now()}_${safeName}`;

    try {
      const bytes = fs.readFileSync(file.filepath);

      const up = await supabaseServer.storage.from("employee-docs").upload(path, bytes, {
        contentType: file.mimetype || "application/octet-stream",
        upsert: true,
      });
      if (up.error) return res.status(500).json({ error: up.error.message });

      const ins = await supabaseServer
        .from("employee_documents")
        .insert({
          employee_id,
          file_name: safeName,
          file_path: path,
          doc_type,
        })
        .select("id, employee_id, file_name, file_path, doc_type, created_at")
        .single();

      if (ins.error) return res.status(500).json({ error: ins.error.message });
      return res.status(200).json({ ok: true, doc: ins.data });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Upload failed" });
    }
  });
}
