import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";

export const config = { api: { bodyParser: false } };

function asString(v: any): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return typeof v === "string" ? v : "";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const form = formidable({ multiples: true, maxFileSize: 25 * 1024 * 1024 });
  let parsed: { fields: formidable.Fields; files: formidable.Files };
  try {
    parsed = await new Promise((resolve, reject) => {
      form.parse(req, (e, fields, files) => (e ? reject(e) : resolve({ fields, files })));
    });
  } catch {
    return res.status(400).json({ error: "Invalid upload" });
  }

  const { fields, files } = parsed;
  const timesheetId = asString(fields.timesheetId);
  if (!timesheetId) return res.status(400).json({ error: "Missing timesheetId" });

  // Pull basic timesheet info for path naming
  const { data: ts } = await supabaseServer
    .from("timesheets")
    .select("id, work_date, worker_name, job_text_clean, job_text_raw")
    .eq("id", timesheetId)
    .single();

  const workDate = String(ts?.work_date || "unknown-date");
  const employeeName = String(ts?.worker_name || "employee");
  const jobText = String(ts?.job_text_clean || ts?.job_text_raw || "job");

  const uploads = (files.slips
    ? Array.isArray(files.slips)
      ? files.slips
      : [files.slips]
    : []) as formidable.File[];

  if (!uploads.length) return res.status(400).json({ error: "No files" });

  const safeEmployee = employeeName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeJob = jobText.slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, "_");

  const created: { path: string; filename: string }[] = [];

  for (let i = 0; i < uploads.length; i++) {
    const f = uploads[i];
    const originalName = f.originalFilename || `slip_${i + 1}`;
    const ext = originalName.includes(".") ? originalName.split(".").pop() : "bin";
    const path = `${workDate}/${safeEmployee}/${timesheetId}_${Date.now()}_${i + 1}_${safeJob}.${ext}`;

    const buffer = fs.readFileSync(f.filepath);
    const { error: upErr } = await supabaseServer.storage
      .from("slips")
      .upload(path, buffer, { contentType: f.mimetype || "application/octet-stream", upsert: true });

    if (upErr) {
      // Continue uploading the rest, but report at least one failure
      return res.status(500).json({ error: `Upload failed: ${upErr.message || "unknown"}` });
    }

    const { error: insErr } = await supabaseServer.from("photo_entries").insert({
      timesheet_id: timesheetId,
      path,
      filename: originalName,
    });

    if (insErr) {
      return res.status(500).json({ error: "Failed to save slip record" });
    }

    created.push({ path, filename: originalName });
  }

  return res.status(200).json({ ok: true, created });
}
