import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import formidable from "formidable";
import fs from "fs";
import { parseCookies, verifySession } from "@/lib/session";

export const config = { api: { bodyParser: false } };

type EquipRow = {
  equipment: string;
  attachment: string;
  hours: string;
  notes: string;
  truckingHours: string;
  truckingNotes: string;
};

type MaterialRow = {
  material: string;
  otherMaterial: string;
  loads: string;
  notes: string;
};

function asString(v: any): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return typeof v === "string" ? v : "";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const form = formidable({ multiples: true, maxFileSize: 20 * 1024 * 1024 });
  let parsed: { fields: formidable.Fields; files: formidable.Files };
  try {
    parsed = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
    });
  } catch {
    return res.status(400).json({ error: "Invalid form submission" });
  }

  const { fields, files } = parsed;

  const pin = asString(fields.pin); // legacy
  const employee = asString(fields.employee); // legacy
  const workDate = asString(fields.workDate);
  const jobType = asString(fields.jobType);
  const jobText = asString(fields.jobText);
  const totalHoursStr = asString(fields.totalHours);
  const headerNotes = asString(fields.headerNotes);

  // Identify employee
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySession(cookies.pcc_session);

  let employeeId: string | null = session?.employee_id ?? null;
  let employeeName: string | null = session?.employee_name ?? null;

  if (!employeeId) {
    // Legacy path: shared app PIN + free-text employee
    const { data: pinData, error: pinErr } = await supabaseServer
      .from("app_settings")
      .select("value")
      .eq("key", "pin")
      .single();
    if (pinErr) return res.status(500).json({ error: "PIN lookup failed" });
    if ((pinData?.value || "") !== pin) return res.status(401).json({ error: "Incorrect PIN" });
    employeeName = employee;
  }

  if (!employeeName || !workDate || !jobType || !jobText) return res.status(400).json({ error: "Missing required fields" });

  const totalHours = Number(totalHoursStr);
  if (Number.isNaN(totalHours) || totalHours <= 0) return res.status(400).json({ error: "Total hours invalid" });

  let equipRows: EquipRow[] = [];
  let materialRows: MaterialRow[] = [];
  try {
    equipRows = JSON.parse(asString(fields.equipRows) || "[]");
    materialRows = JSON.parse(asString(fields.materialRows) || "[]");
  } catch {
    return res.status(400).json({ error: "Rows invalid" });
  }

  // Calculate PCC pay week start (Thursday)
  const wd = new Date(workDate + "T00:00:00Z");
  const dow = wd.getUTCDay(); // 0=Sun..6=Sat
  const diff = (dow - 4 + 7) % 7; // days since Thursday
  const weekStart = new Date(wd);
  weekStart.setUTCDate(wd.getUTCDate() - diff);
  const weekStartYMD = weekStart.toISOString().slice(0, 10);

  // Insert timesheet (raw + clean)
  const { data: ts, error: tsErr } = await supabaseServer
    .from("timesheets")
    .insert({
      worker_name: employeeName,
      employee_id: employeeId,
      week_start: weekStartYMD,
      work_date: workDate,
      job_type: jobType,
      job_text: jobText,
      job_text_raw: jobText,
      job_text_clean: jobText,
      total_hours: totalHours,
      notes: headerNotes || null,
    })
    .select("id")
    .single();

  if (tsErr || !ts?.id) return res.status(500).json({ error: "Failed to save timesheet" });
  const timesheetId = ts.id as string;

  // Insert equipment
  const equipPayload = (equipRows || [])
    .filter((r) => r?.equipment?.trim())
    .map((r) => ({
      timesheet_id: timesheetId,
      equipment: r.equipment,
      attachment: r.attachment || null,
      hours: r.equipment === "Dump Truck" ? null : (r.hours ? Number(r.hours) : null),
      notes: r.equipment === "Dump Truck" ? null : (r.notes || null),
      trucking_hours: r.equipment === "Dump Truck" ? (r.truckingHours ? Number(r.truckingHours) : null) : null,
      trucking_notes: r.equipment === "Dump Truck" ? (r.truckingNotes || null) : null,
    }));

  if (equipPayload.length) {
    const { error } = await supabaseServer.from("equipment_entries").insert(equipPayload);
    if (error) return res.status(500).json({ error: "Failed to save equipment entries" });
  }

  // Insert materials
  const matPayload = (materialRows || [])
    .filter((r) => (r?.material || "").trim())
    .map((r) => ({
      timesheet_id: timesheetId,
      material: r.material === "Other" ? (r.otherMaterial?.trim() || "Other") : r.material,
      loads: Number(r.loads || 0),
      notes: r.notes || null,
    }))
    .filter((r) => !Number.isNaN(r.loads) && r.loads !== 0);

  if (matPayload.length) {
    const { error } = await supabaseServer.from("material_entries").insert(matPayload);
    if (error) return res.status(500).json({ error: "Failed to save material entries" });
  }

  // Photos upload
  const photos = (files.photos ? (Array.isArray(files.photos) ? files.photos : [files.photos]) : []) as formidable.File[];

  for (let i = 0; i < photos.length; i++) {
    const f = photos[i];
    const originalName = f.originalFilename || `photo_${i + 1}.jpg`;
    const ext = originalName.includes(".") ? originalName.split(".").pop() : "jpg";

    const safeDate = workDate || "unknown-date";
    const safeEmployee = (employeeName || "employee").replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeJob = jobText.slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, "_");

    const path = `${safeDate}/${safeEmployee}/${timesheetId}_${i + 1}_${safeJob}.${ext}`;

    const buffer = fs.readFileSync(f.filepath);

    const { error: upErr } = await supabaseServer.storage
      .from("slips")
      .upload(path, buffer, { contentType: f.mimetype || "image/jpeg", upsert: true });

    if (!upErr) {
      await supabaseServer.from("photo_entries").insert({
        timesheet_id: timesheetId,
        path,
        filename: originalName,
      });
    }
  }

  return res.status(200).json({ ok: true, timesheetId });
}
