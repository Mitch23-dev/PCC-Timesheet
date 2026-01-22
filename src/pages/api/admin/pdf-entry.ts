import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function textWidth(font: any, size: number, text: string) {
  return font.widthOfTextAtSize(String(text ?? ""), size);
}

function wrapText(font: any, size: number, text: string, maxWidth: number): string[] {
  const raw = String(text ?? "");
  if (!raw.trim()) return [""];
  const out: string[] = [];
  const paragraphs = raw.replace(/\r\n/g, "\n").split("\n");

  const breakLongWord = (word: string) => {
    const parts: string[] = [];
    let cur = "";
    for (const ch of word) {
      const next = cur + ch;
      if (textWidth(font, size, next) <= maxWidth || cur.length === 0) cur = next;
      else {
        parts.push(cur);
        cur = ch;
      }
    }
    if (cur) parts.push(cur);
    return parts;
  };

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (textWidth(font, size, candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      if (textWidth(font, size, w) > maxWidth) {
        const parts = breakLongWord(w);
        for (let i = 0; i < parts.length - 1; i++) out.push(parts[i]);
        line = parts[parts.length - 1] || "";
      } else {
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [""];
}

function drawWrappedText(page: any, font: any, size: number, text: string, x: number, yTop: number, maxWidth: number, lineH = size + 2) {
  const lines = wrapText(font, size, text, maxWidth);
  let y = yTop;
  for (const ln of lines) {
    page.drawText(ln, { x, y, size, font });
    y -= lineH;
  }
  return { lines, yEnd: y };
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9 _.-]/g, "_").slice(0, 120);
}

async function downloadImageBytes(path: string) {
  const { data, error } = await supabaseServer.storage.from("slips").download(path);
  if (error || !data) return null;
  const ab = await data.arrayBuffer();
  return new Uint8Array(ab);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).send(err);

  const id = typeof req.query.id === "string" ? req.query.id : null;
  if (!id) return res.status(400).send("Missing id");

  const { data: ts, error: tsErr } = await supabaseServer
    .from("timesheets")
    .select("id, work_date, worker_name, job_type, job_text_clean, total_hours, notes")
    .eq("id", id)
    .single();
  if (tsErr || !ts) return res.status(404).send("Not found");

  const { data: equip } = await supabaseServer
    .from("equipment_entries")
    .select("equipment, attachment, hours, notes, trucking_hours, trucking_notes")
    .eq("timesheet_id", id);

  const { data: mats } = await supabaseServer
    .from("material_entries")
    .select("material, loads, notes")
    .eq("timesheet_id", id);

  const { data: photos } = await supabaseServer
    .from("photo_entries")
    .select("path, filename, created_at")
    .eq("timesheet_id", id)
    .order("created_at", { ascending: true });

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Page 1: landscape (11 x 8.5 in)
  const page1 = pdf.addPage([792, 612]); // landscape letter
  const margin = 36;
  let y = 612 - margin;

  function drawText(txt: string, size: number, bold = false) {
    page1.drawText(txt, {
      x: margin,
      y,
      size,
      font: bold ? fontB : font,
      color: rgb(0,0,0),
    });
    y -= size + 6;
  }

  function drawLabelAndWrap(label: string, value: string, size: number) {
    const labelText = `${label} `;
    const labelW = textWidth(fontB, size, labelText);
    page1.drawText(labelText, { x: margin, y, size, font: fontB });
    const maxW = (792 - margin * 2) - labelW;
    const { lines } = drawWrappedText(page1, font, size, value, margin + labelW, y, maxW, size + 3);
    // advance y by wrapped height
    y -= Math.max(1, lines.length) * (size + 3) + 3;
  }

  drawText("Peter Conrod Construction Ltd. — Timesheet", 14, true);
  drawText(`Date: ${ts.work_date}   Employee: ${ts.worker_name}   Job Type: ${ts.job_type}`, 11);
  drawLabelAndWrap("Job:", String(ts.job_text_clean || ""), 11);
  drawText(`Total Hours: ${ts.total_hours}`, 11);
  drawLabelAndWrap("Notes:", String((ts.notes && String(ts.notes).trim()) ? ts.notes : "—"), 10);

  y -= 6;
  page1.drawLine({ start: { x: margin, y }, end: { x: 792 - margin, y }, thickness: 1, color: rgb(0.85,0.85,0.85) });
  y -= 12;

  // Equipment table
  drawText("Time / Equipment", 12, true);
  const eqCols = [
    { h: "Equipment", w: 210 },
    { h: "Attachment", w: 80 },
    { h: "Equip Hrs", w: 70 },
    { h: "Truck Hrs", w: 70 },
    { h: "Notes", w: 270 },
  ];
  const tableX = margin;
  const minRowH = 22;

  function drawCellText(
    page: any,
    txt: string,
    x: number,
    yBaseline: number,
    w: number,
    size: number,
    fontToUse: any,
    align: "left" | "center" | "right" = "left"
  ) {
    const t = String(txt ?? "");
    const tw = textWidth(fontToUse, size, t);
    let xx = x;
    if (align === "center") xx = x + Math.max(0, (w - tw) / 2);
    if (align === "right") xx = x + Math.max(0, w - tw);
    page.drawText(t, { x: xx, y: yBaseline, size, font: fontToUse });
  }

  function drawRow(values: string[], bold = false) {
    const size = 9;
    const lineH = 11;
    const padTop = 6;
    const padBot = 6;
    const notes = String(values[4] ?? "");
    const noteLines = bold ? [notes] : wrapText(font, size, notes, eqCols[4].w - 6);
    const linesN = Math.max(1, noteLines.length);
    const rowHeight = Math.max(minRowH, padTop + size + (linesN - 1) * lineH + padBot);

    const yBaseline = y - padTop - size;
    let x = tableX;
    const f = bold ? fontB : font;

    drawCellText(page1, String(values[0] ?? ""), x, yBaseline, eqCols[0].w, size, f, "left");
    x += eqCols[0].w;
    drawCellText(page1, String(values[1] ?? ""), x, yBaseline, eqCols[1].w, size, f, "left");
    x += eqCols[1].w;
    // center hours under their headers
    drawCellText(page1, String(values[2] ?? ""), x, yBaseline, eqCols[2].w, size, f, "center");
    x += eqCols[2].w;
    drawCellText(page1, String(values[3] ?? ""), x, yBaseline, eqCols[3].w, size, f, "center");
    x += eqCols[3].w;

    if (bold) {
      drawCellText(page1, String(values[4] ?? ""), x, yBaseline, eqCols[4].w, size, fontB, "left");
    } else {
      drawWrappedText(page1, font, size, notes, x, yBaseline, eqCols[4].w - 6, lineH);
    }

    if (!bold) {
      const yLine = y - rowHeight;
      page1.drawLine({
        start: { x: margin, y: yLine },
        end: { x: 792 - margin, y: yLine },
        thickness: 0.5,
        color: rgb(0.92, 0.92, 0.94),
      });
    }

    y -= rowHeight;
  }

  drawRow(eqCols.map(c => c.h), true);
  page1.drawLine({ start: { x: margin, y: y + 2 }, end: { x: 792 - margin, y: y + 2 }, thickness: 0.8, color: rgb(0.8,0.8,0.8) });

  const eqRows = (equip || []).map((e:any) => {
    const isDump = e.equipment === "Dump Truck";
    return [
      String(e.equipment || ""),
      isDump ? "" : String(e.attachment || ""),
      isDump ? "" : (e.hours ?? "") + "",
      isDump ? (e.trucking_hours ?? "") + "" : "",
      isDump ? String(e.trucking_notes || "") : String(e.notes || ""),
    ];
  });

  if (!eqRows.length) {
    drawRow(["(none)", "", "", "", ""]);
  } else {
    for (const r of eqRows) {
      if (y < 150) break; // avoid overflow; rare
      drawRow(r);
    }
  }

  y -= 8;
  drawText("Materials (Loads)", 12, true);

  const mCols = [
    { h: "Material", w: 360 },
    { h: "Loads", w: 70 },
    { h: "Notes", w: 290 },
  ];
  function drawMRow(values: string[], bold = false) {
    const size = 9;
    const lineH = 11;
    const padTop = 6;
    const padBot = 6;
    const notes = String(values[2] ?? "");
    const noteLines = bold ? [notes] : wrapText(font, size, notes, mCols[2].w - 6);
    const linesN = Math.max(1, noteLines.length);
    const rowHeight = Math.max(minRowH, padTop + size + (linesN - 1) * lineH + padBot);
    const yBaseline = y - padTop - size;

    let x = margin;
    const f = bold ? fontB : font;

    drawCellText(page1, String(values[0] ?? ""), x, yBaseline, mCols[0].w, size, f, "left");
    x += mCols[0].w;
    // center loads
    drawCellText(page1, String(values[1] ?? ""), x, yBaseline, mCols[1].w, size, f, "center");
    x += mCols[1].w;

    if (bold) {
      drawCellText(page1, notes, x, yBaseline, mCols[2].w, size, fontB, "left");
    } else {
      drawWrappedText(page1, font, size, notes, x, yBaseline, mCols[2].w - 6, lineH);
      const yLine = y - rowHeight;
      page1.drawLine({ start: { x: margin, y: yLine }, end: { x: 792 - margin, y: yLine }, thickness: 0.5, color: rgb(0.92, 0.92, 0.94) });
    }

    y -= rowHeight;
  }

  drawMRow(mCols.map(c=>c.h), true);
  page1.drawLine({ start: { x: margin, y: y + 2 }, end: { x: 792 - margin, y: y + 2 }, thickness: 0.8, color: rgb(0.8,0.8,0.8) });

  const mRows = (mats || []).map((m:any) => [String(m.material||""), String(m.loads ?? ""), String(m.notes||"")]);
  if (!mRows.length) drawMRow(["(none)","",""]);
  else {
    for (const r of mRows) {
      if (y < 70) break;
      drawMRow(r);
    }
  }

  // Footer
  page1.drawText("Slips to follow.", { x: margin, y: 24, size: 10, font: fontB });

  // Photo pages: portrait letter
  for (const p of (photos || [])) {
    const bytes = await downloadImageBytes(p.path);
    if (!bytes) continue;

    let img;
    const lower = String(p.path || "").toLowerCase();
    try {
      if (lower.endsWith(".png")) img = await pdf.embedPng(bytes);
      else img = await pdf.embedJpg(bytes);
    } catch {
      continue;
    }

    const page = pdf.addPage([612, 792]); // portrait letter
    const m = 36;

    // header
    const header = `${ts.worker_name} — ${ts.job_text_clean} — ${ts.work_date}`;
    page.drawText(header, { x: m, y: 792 - m, size: 11, font: fontB });

    const fn = String(p.filename || "");
    page.drawText(fn, { x: m, y: 792 - m - 16, size: 9, font });

    // image area
    const maxW = 612 - m*2;
    const maxH = 792 - m*3 - 20; // header space
    const dims = img.scale(1);
    const scale = Math.min(maxW / dims.width, maxH / dims.height);
    const w = dims.width * scale;
    const h = dims.height * scale;
    const x = (612 - w) / 2;
    const yImg = (792 - m*2 - 30 - h); // below header
    page.drawImage(img, { x, y: Math.max(m, yImg), width: w, height: h });
  }

  const pdfBytes = await pdf.save();

  const filename = sanitizeFilename(`${ts.worker_name} Timesheet - ${ts.work_date}.pdf`);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(Buffer.from(pdfBytes));
}
