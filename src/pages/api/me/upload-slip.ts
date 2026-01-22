import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseCookies, verifySession } from "@/lib/session";

export const config = { api: { bodyParser: false } };

function asString(v: any): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return typeof v === "string" ? v : "";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySession(cookies.pcc_session);
  if (!session) return res.status(401).json({ error: "Not signed in" });

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const form = formidable({ multiples: true, maxFileSize: 25 * 1024 * 1024 });

  const { fields, files } = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
    form.parse(req, (err, flds, fls) => {
      if (err) reject(err);
      else resolve({ fields: flds, files: fls });
    });
  }).catch((e) => {
    return res.status(400).json({ error: "Invalid upload" }) as any;
  });

  // If we already responded
  // @ts-ignore
  if (res.writableEnded) return;

  const timesheetId = asString(fields.timesheetId);
  if (!timesheetId) return res.status(400).json({ error: "Missing timesheetId" });

  // Ensure timesheet belongs to this employee and isn't locked
  const { data: ts, error: tsErr } = await supabaseServer
    .from("timesheets")
    .select("id, employee_id, work_date, job_text_clean, locked")
    .eq("id", timesheetId)
    .single();

  if (tsErr || !ts) return res.status(404).json({ error: "Timesheet not found" });
  if (ts.employee_id !== session.employee_id) return res.status(403).json({ error: "Forbidden" });
  if (ts.locked) return res.status(403).json({ error: "This pay period is locked" });

  const workDate = String(ts.work_date || "").slice(0, 10) || "unknown-date";
  const jobText = String(ts.job_text_clean || "job").slice(0, 60);

  const upload = files.files;
  const uploads: formidable.File[] = [];
  if (Array.isArray(upload)) uploads.push(...upload);
  else if (upload) uploads.push(upload as formidable.File);

  if (!uploads.length) return res.status(400).json({ error: "No files" });

  const safeEmployee = String(session.employee_name || "employee").replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeJob = jobText.replace(/[^a-zA-Z0-9_-]/g, "_");

  const created: { path: string; filename: string }[] = [];

  for (let i = 0; i < uploads.length; i++) {
    const f = uploads[i];
    const originalName = f.originalFilename || `slip_${i + 1}`;
    const ext = originalName.includes(".") ? originalName.split(".").pop() : "bin";
    const path = `${workDate}/${safeEmployee}/${timesheetId}_${Date.now()}_${i + 1}_${safeJob}.${ext}`;

    const buffer = fs.readFileSync(f.filepath);
    const { error: upErr } = await supabaseServer.storage.from("slips").upload(path, buffer, {
      contentType: f.mimetype || "application/octet-stream",
      upsert: false,
    });
    if (upErr) return res.status(500).json({ error: upErr.message });

    const { error: insErr } = await supabaseServer.from("photo_entries").insert({
      timesheet_id: timesheetId,
      path,
      filename: originalName,
    });
    if (insErr) return res.status(500).json({ error: insErr.message });

    created.push({ path, filename: originalName });
  }

  return res.status(200).json({ ok: true, created });
}
