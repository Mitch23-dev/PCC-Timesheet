import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9 _.-]/g, "_").slice(0, 140);
}

function textWidth(font: any, size: number, text: string) {
  return font.widthOfTextAtSize(String(text ?? ""), size);
}

function wrapText(font: any, size: number, text: string, maxWidth: number): string[] {
  const raw = String(text ?? "");
  if (!raw.trim()) return [""];
  const out: string[] = [];
  for (const para of raw.replace(/\r\n/g, "\n").split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (textWidth(font, size, next) <= maxWidth) line = next;
      else {
        if (line) out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [""];
}

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  const id = typeof req.query.id === "string" ? req.query.id : null;
  if (!id) return res.status(400).json({ error: "Missing id" });

  const { data: sheet, error: sheetErr } = await supabaseServer
    .from("weekly_timesheets")
    .select("id, employee_name, week_start, timesheet_type, status, total_hours, submitted_at")
    .eq("id", id)
    .single();
  if (sheetErr || !sheet) return res.status(404).json({ error: "Weekly timesheet not found" });

  const { data: entries, error: entriesErr } = await supabaseServer
    .from("weekly_timesheet_entries")
    .select("entry_date, start_time, end_time, hours, job_label, equipment_label, attachment_label, description, sort_order")
    .eq("weekly_timesheet_id", id)
    .order("entry_date", { ascending: true })
    .order("sort_order", { ascending: true });
  if (entriesErr) return res.status(500).json({ error: "Failed to load weekly entries" });

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  const m = 40;
  const usableW = 612 - m * 2;
  let y = 752;

  const ensure = (need = 40) => {
    if (y - need < 60) {
      page = pdf.addPage([612, 792]);
      y = 752;
    }
  };

  page.drawText("PCC Weekly Grid Timesheet", { x: m, y, size: 18, font: fontB });
  y -= 26;
  page.drawText(`${sheet.timesheet_type === "mechanic" ? "Mechanic Grid" : "Management Grid"} • ${sheet.status === "submitted" ? "Submitted" : "Draft"}`, { x: m, y, size: 10, font, color: rgb(0.35, 0.35, 0.4) });
  y -= 22;

  const meta = [
    ["Employee", String(sheet.employee_name || "")],
    ["Week", `${sheet.week_start} to ${addDaysISO(String(sheet.week_start), 6)}`],
    ["Total Hours", Number(sheet.total_hours || 0).toFixed(1)],
    ["Submitted", sheet.submitted_at ? String(sheet.submitted_at).slice(0, 10) : "—"],
  ] as const;

  for (const [k, v] of meta) {
    page.drawText(`${k}:`, { x: m, y, size: 10, font: fontB });
    page.drawText(String(v), { x: m + 88, y, size: 10, font });
    y -= 14;
  }
  y -= 8;

  const grouped: Record<string, any[]> = {};
  for (const row of entries || []) {
    const key = String(row.entry_date || "");
    (grouped[key] ||= []).push(row);
  }

  const dates = Object.keys(grouped).sort();
  if (!dates.length) {
    page.drawText("No weekly entries found.", { x: m, y, size: 11, font });
  }

  for (const day of dates) {
    ensure(44);
    page.drawRectangle({ x: m, y: y - 14, width: usableW, height: 18, color: rgb(0.96, 0.96, 0.98), borderColor: rgb(0.88, 0.88, 0.92), borderWidth: 1 });
    page.drawText(day, { x: m + 8, y: y - 10, size: 10, font: fontB });
    y -= 24;

    const cols = [
      { x: m, w: 85, h: "Start" },
      { x: m + 85, w: 85, h: "End" },
      { x: m + 170, w: 60, h: "Hours" },
      { x: m + 230, w: 150, h: sheet.timesheet_type === "mechanic" ? "Equipment" : "Job" },
      { x: m + 380, w: 92, h: "Attachment" },
      { x: m + 472, w: 100, h: "Description" },
    ];

    for (const c of cols) page.drawText(c.h, { x: c.x, y, size: 8.5, font: fontB, color: rgb(0.35, 0.35, 0.4) });
    y -= 10;
    page.drawLine({ start: { x: m, y }, end: { x: m + usableW, y }, thickness: 1, color: rgb(0.86, 0.86, 0.9) });
    y -= 8;

    for (const row of grouped[day]) {
      const descLines = wrapText(font, 8.5, String(row.description || ""), 96);
      const labelLines = wrapText(font, 8.5, String(row.job_label || row.equipment_label || ""), 146);
      const attLines = wrapText(font, 8.5, String(row.attachment_label || ""), 88);
      const rowLines = Math.max(1, descLines.length, labelLines.length, attLines.length);
      const rowH = rowLines * 10 + 6;
      ensure(rowH + 8);

      page.drawText(String(row.start_time || ""), { x: cols[0].x, y, size: 8.5, font });
      page.drawText(String(row.end_time || ""), { x: cols[1].x, y, size: 8.5, font });
      page.drawText(Number(row.hours || 0).toFixed(1), { x: cols[2].x, y, size: 8.5, font });
      for (let i = 0; i < labelLines.length; i++) page.drawText(labelLines[i], { x: cols[3].x, y: y - i * 10, size: 8.5, font });
      for (let i = 0; i < attLines.length; i++) page.drawText(attLines[i], { x: cols[4].x, y: y - i * 10, size: 8.5, font });
      for (let i = 0; i < descLines.length; i++) page.drawText(descLines[i], { x: cols[5].x, y: y - i * 10, size: 8.5, font });
      y -= rowH;
      page.drawLine({ start: { x: m, y }, end: { x: m + usableW, y }, thickness: 1, color: rgb(0.93, 0.93, 0.95) });
      y -= 6;
    }
    y -= 6;
  }

  const bytes = await pdf.save();
  const filename = sanitizeFilename(`${sheet.employee_name} Weekly Timesheet - ${sheet.week_start}.pdf`);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(Buffer.from(bytes));
}
