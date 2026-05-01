import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9 _.-]/g, "_").slice(0, 140);
}

async function downloadImageBytes(path: string) {
  const { data, error } = await supabaseServer.storage.from("slips").download(path);
  if (error || !data) return null;
  const ab = await data.arrayBuffer();
  return new Uint8Array(ab);
}

type TimesheetRow = {
  id: string;
  work_date: string;
  worker_name: string;
  job_type: string;
  job_text_clean: string;
  total_hours: number;
  notes: string | null;
};

function moneyPad(n: number, digits = 1) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toFixed(digits).replace(/\.0$/, "");
}

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
      if (textWidth(font, size, next) <= maxWidth || cur.length === 0) {
        cur = next;
      } else {
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
      // If even the single word is too long, hard-break it.
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

function drawTextCentered(page: any, font: any, size: number, text: string, x: number, y: number, w: number) {
  const t = String(text ?? "");
  const tw = textWidth(font, size, t);
  const tx = x + Math.max(0, (w - tw) / 2);
  page.drawText(t, { x: tx, y, size, font });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : null;
  const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : null;
  const employee = typeof req.query.employee === "string" ? req.query.employee : "All";
  const jobType = typeof req.query.jobType === "string" ? req.query.jobType : "All";
  const jobSearch = typeof req.query.jobSearch === "string" ? req.query.jobSearch.trim() : "";

  let q = supabaseServer
    .from("timesheets")
    .select("id, work_date, worker_name, job_type, job_text_clean, total_hours, notes")
    .limit(500);

  if (dateFrom) q = q.gte("work_date", dateFrom);
  if (dateTo) q = q.lte("work_date", dateTo);
  if (employee && employee !== "All") q = q.eq("worker_name", employee);
  if (jobType && jobType !== "All") q = q.eq("job_type", jobType);
  if (jobSearch) q = q.ilike("job_text_clean", `%${jobSearch}%`);

  q = q.order("work_date", { ascending: true });

  const { data: tsListRaw, error: tsErr } = await q;
  if (tsErr) return res.status(500).send("Failed query");

  const tsList = (tsListRaw || []) as TimesheetRow[];
  const ids = tsList.map((t) => t.id);
  if (!ids.length) {
    const empty = await (await PDFDocument.create()).save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Timesheets.pdf"`);
    return res.status(200).send(Buffer.from(empty));
  }

  // Equipment + materials + photos for the selected timesheets
  const { data: equipAll } = await supabaseServer
    .from("equipment_entries")
    .select("timesheet_id, equipment, attachment, hours, notes, trucking_hours, trucking_notes")
    .in("timesheet_id", ids);

  const { data: photosAll } = await supabaseServer
    .from("photo_entries")
    .select("timesheet_id, path, filename, created_at")
    .in("timesheet_id", ids)
    .order("created_at", { ascending: true });

  const { data: matsAll } = await supabaseServer
    .from("material_entries")
    .select("timesheet_id, material, loads")
    .in("timesheet_id", ids);

  const matsBy: Record<string, any[]> = {};
  for (const mm of (matsAll || []) as any[]) {
    const k = String(mm.timesheet_id);
    (matsBy[k] ||= []).push(mm);
  }

  const equipBy: Record<string, any[]> = {};
  for (const e of (equipAll || []) as any[]) {
    const k = String(e.timesheet_id);
    (equipBy[k] ||= []).push(e);
  }

  const photosByTs: Record<string, any[]> = {};
  for (const p of (photosAll || []) as any[]) {
    const k = String(p.timesheet_id);
    (photosByTs[k] ||= []).push(p);
  }

  // Group by date (Day -> entries)
  const byDate: Record<string, TimesheetRow[]> = {};
  for (const t of tsList) (byDate[t.work_date] ||= []).push(t);
  const dates = Object.keys(byDate).sort();

  // Summary totals
  const totalLabour = tsList.reduce((a, t) => a + Number(t.total_hours || 0), 0);
  const totalEquip = (equipAll || []).reduce((a: number, e: any) => a + Number(e.hours || 0), 0);
  const totalTruck = (equipAll || []).reduce((a: number, e: any) => a + Number(e.trucking_hours || 0), 0);

  const hoursByEquipment: Record<string, { equip: number; truck: number }> = {};
  for (const e of (equipAll || []) as any[]) {
    const key = String(e.equipment || "").trim();
    if (!key) continue;
    const equipH = Number(e.hours || 0);
    const truckH = Number(e.trucking_hours || 0);
    if (!Number.isFinite(equipH) && !Number.isFinite(truckH)) continue;
    const cur = (hoursByEquipment[key] ||= { equip: 0, truck: 0 });
    if (Number.isFinite(equipH)) cur.equip += equipH;
    if (Number.isFinite(truckH)) cur.truck += truckH;
  }

  const loadsByMaterial: Record<string, number> = {};
  for (const m of (matsAll || []) as any[]) {
    const key = String(m.material || "").trim();
    const loads = Number(m.loads || 0);
    if (!key || !Number.isFinite(loads) || loads === 0) continue;
    loadsByMaterial[key] = (loadsByMaterial[key] || 0) + loads;
  }

  const labourByEmployee: Record<string, number> = {};
  for (const t of tsList) labourByEmployee[t.worker_name] = (labourByEmployee[t.worker_name] || 0) + Number(t.total_hours || 0);

  const labourByDate: Record<string, number> = {};
  for (const d of dates) labourByDate[d] = byDate[d].reduce((a, t) => a + Number(t.total_hours || 0), 0);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);

  // ---------- Page 1: Overall summary ----------
  {
    const page = pdf.addPage([612, 792]);
    const m = 40;
    let y = 792 - m;

    const df = dateFrom || dates[0] || "";
    const dt = dateTo || dates[dates.length - 1] || "";

    page.drawText("PCC Timesheet Report", { x: m, y, size: 18, font: fontB });
    y -= 24;

    const filters: string[] = [];
    if (employee && employee !== "All") filters.push(`Employee: ${employee}`);
    if (jobType && jobType !== "All") filters.push(`Job Type: ${jobType}`);
    if (jobSearch) filters.push(`Search: ${jobSearch}`);
    filters.push(`Dates: ${df}${dt ? " to " + dt : ""}`);

    page.drawText(filters.join(" • "), { x: m, y, size: 10, font, color: rgb(0.25, 0.25, 0.25) });
    y -= 22;

    // Totals cards
    const cardW = (612 - m * 2 - 20) / 3;
    const cardH = 54;
    const cards = [
      { label: "Labour Hours", val: moneyPad(totalLabour, 1) },
      { label: "Equipment Hours", val: moneyPad(totalEquip, 1) },
      { label: "Trucking Hours", val: moneyPad(totalTruck, 1) },
    ];
    for (let i = 0; i < cards.length; i++) {
      const x = m + i * (cardW + 10);
      page.drawRectangle({ x, y: y - cardH + 10, width: cardW, height: cardH, borderColor: rgb(0.85, 0.85, 0.88), borderWidth: 1, color: rgb(0.98, 0.98, 1) });
      page.drawText(cards[i].label, { x: x + 10, y: y - 16, size: 10, font, color: rgb(0.35, 0.35, 0.4) });
      page.drawText(String(cards[i].val), { x: x + 10, y: y - 40, size: 18, font: fontB });
    }
    y -= cardH + 18;

    // Employee breakdown table
    page.drawText("Hours by Employee", { x: m, y, size: 12, font: fontB });
    y -= 14;

    const empRows = Object.entries(labourByEmployee).sort((a, b) => a[0].localeCompare(b[0]));
    const col1 = 360;
    const col2 = 140;
    page.drawLine({ start: { x: m, y }, end: { x: 612 - m, y }, thickness: 1, color: rgb(0.9, 0.9, 0.92) });
    y -= 12;

    page.drawText("Employee", { x: m, y, size: 9, font: fontB, color: rgb(0.35, 0.35, 0.4) });
    drawTextCentered(page, fontB, 9, "Labour Hours", m + col1, y, col2);
    y -= 14;

    for (const [name, hrs] of empRows) {
      page.drawText(name, { x: m, y, size: 10, font });
      drawTextCentered(page, font, 10, moneyPad(hrs, 1), m + col1, y, col2);
      y -= 14;
      if (y < 120) break;
    }

    // Equipment summary (between employee + materials)
    y -= 18;
    page.drawText("Equipment Summary", { x: m, y, size: 12, font: fontB });
    y -= 14;

    const eqRows = Object.entries(hoursByEquipment)
      .map(([name, v]) => ({ name, equip: v.equip, truck: v.truck }))
      .filter((r) => r.equip !== 0 || r.truck !== 0)
      .sort((a, b) => (b.equip + b.truck) - (a.equip + a.truck));

    // underline
    page.drawLine({ start: { x: m, y }, end: { x: 612 - m, y }, thickness: 1, color: rgb(0.9, 0.9, 0.92) });
    y -= 12;

    const ecol1 = 300;
    const ecol2 = 100;
    const ecol3 = 100;
    page.drawText("Equipment", { x: m, y, size: 9, font: fontB, color: rgb(0.35, 0.35, 0.4) });
    drawTextCentered(page, fontB, 9, "Hours", m + ecol1, y, ecol2);
    drawTextCentered(page, fontB, 9, "Trucking", m + ecol1 + ecol2, y, ecol3);
    y -= 14;

    if (!eqRows.length) {
      page.drawText("No equipment entries for this filter.", { x: m, y, size: 10, font, color: rgb(0.35, 0.35, 0.4) });
      y -= 14;
    } else {
      for (const r of eqRows) {
        const nameLines = wrapText(font, 10, r.name, ecol1 - 10);
        const rowH = Math.max(14, nameLines.length * 12);
        if (y - rowH < 110) break; // keep summary compact on page 1

        for (let i = 0; i < nameLines.length; i++) {
          page.drawText(nameLines[i], { x: m, y: y - i * 12, size: 10, font });
        }
        drawTextCentered(page, font, 10, moneyPad(r.equip, 1), m + ecol1, y, ecol2);
        drawTextCentered(page, font, 10, moneyPad(r.truck, 1), m + ecol1 + ecol2, y, ecol3);
        y -= rowH;
      }
    }

	    // Material summary (match the "Hours by Employee" visual style)
	    y -= 18;
	    page.drawText("Material Summary", { x: m, y, size: 12, font: fontB });
	    y -= 14;

	    const matRows = Object.entries(loadsByMaterial)
	      .sort((a, b) => b[1] - a[1])
	      .map(([name, loads]) => [name, String(Math.round(loads))] as const);

	    // underline
	    page.drawLine({ start: { x: m, y }, end: { x: 612 - m, y }, thickness: 1, color: rgb(0.9, 0.9, 0.92) });
	    y -= 12;

	    // headers
	    const mcol1 = 360;
	    const mcol2 = 140;
	    page.drawText("Material", { x: m, y, size: 9, font: fontB, color: rgb(0.35, 0.35, 0.4) });
	    drawTextCentered(page, fontB, 9, "Loads", m + mcol1, y, mcol2);
	    y -= 14;

	    if (!matRows.length) {
	      page.drawText("No material entries for this filter.", { x: m, y, size: 10, font, color: rgb(0.35, 0.35, 0.4) });
	    } else {
	      const size = 10;
	      const lineH = 12;
	      for (const [mat, loads] of matRows) {
	        const nameLines = wrapText(font, size, mat, mcol1 - 10);
	        const rowH = Math.max(14, nameLines.length * lineH);
	        if (y - rowH < 70) break; // keep summary compact (one page)

	        // material (wrapped)
	        for (let i = 0; i < nameLines.length; i++) {
	          page.drawText(nameLines[i], { x: m, y: y - i * lineH, size, font });
	        }
	        // loads aligned with first line
	        drawTextCentered(page, font, size, loads, m + mcol1, y, mcol2);
	        y -= rowH;
	      }
	    }

    page.drawText(`Generated: ${new Date().toISOString().slice(0, 10)}`, { x: m, y: 28, size: 8, font, color: rgb(0.45, 0.45, 0.5) });
  }

  // ---------- Per-day pages + slips ----------
  // Detailed day reports (entry detail + equipment/material) followed by that day's slips.
  function drawSectionTitle(page: any, x: number, y: number, title: string) {
    page.drawText(title, { x, y, size: 11, font: fontB, color: rgb(0.15, 0.15, 0.18) });
  }

  function drawKeyVal(page: any, x: number, y: number, key: string, val: string) {
    page.drawText(key, { x, y, size: 9, font: fontB, color: rgb(0.35, 0.35, 0.4) });
    page.drawText(val, { x: x + textWidth(fontB, 9, key) + 6, y, size: 9, font, color: rgb(0.15, 0.15, 0.18) });
  }

  function ensurePage(current: { page: any; y: number }, needHeight: number, title?: string) {
    const m = 40;
    if (current.y - needHeight < 60) {
      current.page = pdf.addPage([612, 792]);
      current.y = 792 - m;
      if (title) {
        current.page.drawText(title, { x: m, y: current.y, size: 14, font: fontB });
        current.y -= 18;
      }
    }
  }

  function drawEntryBlock(current: { page: any; y: number }, ts: TimesheetRow, eqRows: any[], matRows: any[]) {
    const m = 40;
    const w = 612 - m * 2;

    // IMPORTANT: `ensurePage()` can replace `current.page`.
    // Never capture a stale page reference; always use `current.page`.

	    // --- Header line
	    // Desired format: Name • Job • Job Type • Hours
	    // Job can be multi-line. Some entries may start with a blank line; grab the first *non-empty* line.
	    const jobLinesRaw = String(ts.job_text_clean || "").replace(/\r\n/g, "\n").split("\n");
	    const jobFirstNonEmpty = jobLinesRaw.find((l) => String(l || "").trim().length > 0)?.trim() || "";
	    const jobShort = jobFirstNonEmpty && jobFirstNonEmpty.length > 42 ? `${jobFirstNonEmpty.slice(0, 41)}…` : jobFirstNonEmpty;
	    const headerParts = [String(ts.worker_name || "").trim(), jobShort || "", String(ts.job_type || "").trim(), `${moneyPad(Number(ts.total_hours || 0), 1)} h`].filter(Boolean);
	    const header = headerParts.join(" • ");
    ensurePage(current, 80, undefined);

    const topY = current.y;
	    current.page.drawRectangle({ x: m, y: topY - 16, width: w, height: 16, color: rgb(0.96, 0.96, 0.98), borderColor: rgb(0.88, 0.88, 0.92), borderWidth: 1 });
    current.page.drawText(header, { x: m + 10, y: topY - 12, size: 10, font: fontB, color: rgb(0.15, 0.15, 0.18) });
	    // extra breathing room under the header bar (prevents "jammed" look)
	    current.y = topY - 30;

    // Job line(s)
    const jobLines = wrapText(font, 10, String(ts.job_text_clean || ""), w - 20);
	    const jobH = Math.max(1, jobLines.length) * 12 + 6;
    ensurePage(current, jobH + 8, undefined);
    for (let i = 0; i < jobLines.length; i++) {
      current.page.drawText(jobLines[i], { x: m + 10, y: current.y - i * 12, size: 10, font });
    }
	    current.y -= jobH;

    // Notes
    const notesText = String(ts.notes || "").trim();
    const notesDisplay = notesText || "—";
    const noteLines = wrapText(font, 9, notesDisplay, w - 20);
    const lineH = 11;
    const noteH = noteLines.length * lineH + 10;
    ensurePage(current, noteH + 8, undefined);

    // slight top padding before the Notes label
    current.y -= 2;
    drawKeyVal(current.page, m + 10, current.y, "Notes:", "");
    current.y -= 12;

    for (let i = 0; i < noteLines.length; i++) {
      current.page.drawText(noteLines[i], {
        x: m + 10,
        y: current.y - i * lineH,
        size: 9,
        font,
        color: rgb(0.2, 0.2, 0.22),
      });
    }
    current.y -= noteLines.length * lineH + 10;


    // Equipment table
    if ((eqRows || []).length) {
      ensurePage(current, 70, undefined);
      drawSectionTitle(current.page, m + 10, current.y, "Time / Equipment");
      current.y -= 14;

      const cols = [
        { h: "Equipment", w: 150 },
        { h: "Attachment", w: 70 },
        { h: "Equip Hrs", w: 60, center: true },
        { h: "Truck Hrs", w: 60, center: true },
        { h: "Notes", w: w - (150 + 70 + 60 + 60) },
      ];
      const x0 = m + 10;
	      const drawEquipHeader = () => {
        let x = x0;
        for (const c of cols) {
	          if ((c as any).center) {
	            drawTextCentered(current.page, fontB, 8.5, c.h, x, current.y, c.w);
	          } else {
	            current.page.drawText(c.h, { x, y: current.y, size: 8.5, font: fontB, color: rgb(0.35, 0.35, 0.4) });
	          }
          x += c.w;
        }
        current.y -= 10;
        current.page.drawLine({ start: { x: x0, y: current.y }, end: { x: x0 + w - 20, y: current.y }, thickness: 1, color: rgb(0.86, 0.86, 0.9) });
        current.y -= 8;
      };

      drawEquipHeader();

      const size = 9;
      const lineH = 11;
      const padTop = 4;
      const padBot = 6;

      for (const r of eqRows as any[]) {
        const vEquip = String(r.equipment || "");
        const vAttach = String(r.attachment || "");
        const vEH = moneyPad(Number(r.hours || 0), 1);
        const vTH = moneyPad(Number(r.trucking_hours || 0), 1);
        const vNotes = String(r.notes || r.trucking_notes || "");

        const noteLines = wrapText(font, size, vNotes, cols[4].w - 6);
        const rowH = Math.max(16, padTop + size + (noteLines.length - 1) * lineH + padBot);

        const before = current.page;
        ensurePage(current, rowH + 10, undefined);
        if (current.page !== before) {
          // Continue the section cleanly on the new page.
          drawSectionTitle(current.page, m + 10, current.y, "Time / Equipment");
          current.y -= 14;
          drawEquipHeader();
        }

        const yTop = current.y;
        const yBase = yTop - padTop - size;

        let cx = x0;
        current.page.drawText(vEquip, { x: cx, y: yBase, size, font }); cx += cols[0].w;
        current.page.drawText(vAttach, { x: cx, y: yBase, size, font }); cx += cols[1].w;

        // centered numeric
        const ehX = cx + (cols[2].w - textWidth(font, size, vEH)) / 2;
        current.page.drawText(vEH, { x: ehX, y: yBase, size, font }); cx += cols[2].w;
        const thX = cx + (cols[3].w - textWidth(font, size, vTH)) / 2;
        current.page.drawText(vTH, { x: thX, y: yBase, size, font }); cx += cols[3].w;

        for (let i = 0; i < noteLines.length; i++) {
          current.page.drawText(noteLines[i], { x: cx, y: yBase - i * lineH, size, font, color: rgb(0.2, 0.2, 0.22) });
        }

        current.y -= rowH;
        current.page.drawLine({ start: { x: x0, y: current.y }, end: { x: x0 + w - 20, y: current.y }, thickness: 1, color: rgb(0.92, 0.92, 0.94) });
        current.y -= 6;
      }
      current.y -= 6;
    }

    // Materials table
    if ((matRows || []).length) {
      ensurePage(current, 60, undefined);
      drawSectionTitle(current.page, m + 10, current.y, "Materials");
      current.y -= 14;

      const cols = [
        { h: "Material", w: 240 },
        { h: "Loads", w: 60, center: true },
        { h: "Notes", w: w - (240 + 60) },
      ];
      const x0 = m + 10;
	      const drawMatHeader = () => {
        let x = x0;
        for (const c of cols) {
	          if ((c as any).center) {
	            drawTextCentered(current.page, fontB, 8.5, c.h, x, current.y, c.w);
	          } else {
	            current.page.drawText(c.h, { x, y: current.y, size: 8.5, font: fontB, color: rgb(0.35, 0.35, 0.4) });
	          }
          x += c.w;
        }
        current.y -= 10;
        current.page.drawLine({ start: { x: x0, y: current.y }, end: { x: x0 + w - 20, y: current.y }, thickness: 1, color: rgb(0.86, 0.86, 0.9) });
        current.y -= 8;
      };

      drawMatHeader();

      const size = 9;
      const lineH = 11;
      const padTop = 4;
      const padBot = 6;

      for (const r of matRows as any[]) {
        const vMat = String(r.material || "");
        const vLoads = String(r.loads ?? "");
        const vNotes = ""; // (no notes in schema currently)

        const noteLines = wrapText(font, size, vNotes, cols[2].w - 6);
        const rowH = Math.max(16, padTop + size + (noteLines.length - 1) * lineH + padBot);

        const before = current.page;
        ensurePage(current, rowH + 10, undefined);
        if (current.page !== before) {
          drawSectionTitle(current.page, m + 10, current.y, "Materials");
          current.y -= 14;
          drawMatHeader();
        }

        const yTop = current.y;
        const yBase = yTop - padTop - size;

        let cx = x0;
        current.page.drawText(vMat, { x: cx, y: yBase, size, font }); cx += cols[0].w;

        const loadsX = cx + (cols[1].w - textWidth(font, size, vLoads)) / 2;
        current.page.drawText(vLoads, { x: loadsX, y: yBase, size, font }); cx += cols[1].w;

        for (let i = 0; i < noteLines.length; i++) {
          current.page.drawText(noteLines[i], { x: cx, y: yBase - i * lineH, size, font, color: rgb(0.2, 0.2, 0.22) });
        }

        current.y -= rowH;
        current.page.drawLine({ start: { x: x0, y: current.y }, end: { x: x0 + w - 20, y: current.y }, thickness: 1, color: rgb(0.92, 0.92, 0.94) });
        current.y -= 6;
      }
      current.y -= 4;
    }

    // bottom spacing between entries
    current.y -= 10;
  }

  // Per-day detailed report pages + slips
  for (const workDate of dates) {
    const dayEntries = byDate[workDate] || [];
    const m = 40;

    // Start day report pages
    let cur = { page: pdf.addPage([612, 792]), y: 792 - m };
    cur.page.drawText(`Day: ${workDate}`, { x: m, y: cur.y, size: 14, font: fontB });
    cur.y -= 18;
    cur.page.drawText(`${dayEntries.length} entr${dayEntries.length === 1 ? "y" : "ies"} • Total Labour: ${moneyPad(dayEntries.reduce((a, t) => a + Number(t.total_hours || 0), 0), 1)} h`, {
      x: m,
      y: cur.y,
      size: 9,
      font,
      color: rgb(0.35, 0.35, 0.4),
    });
    cur.y -= 16;
    cur.page.drawLine({ start: { x: m, y: cur.y }, end: { x: 612 - m, y: cur.y }, thickness: 1, color: rgb(0.88, 0.88, 0.92) });
    cur.y -= 14;

    // Draw each entry's detailed block
    for (const ts of dayEntries) {
      drawEntryBlock(cur, ts, equipBy[ts.id] || [], matsBy[ts.id] || []);
    }

    // Slips for this day, in entry order
    for (const ts of dayEntries) {
      const slips = (photosByTs[ts.id] || []) as any[];
      for (const p of slips) {
        const path = String(p.path || "");
        const bytes = await downloadImageBytes(path);
        if (!bytes) continue;

        let img: any = null;
        try {
          const lower = path.toLowerCase();
          if (lower.endsWith(".png")) img = await pdf.embedPng(bytes);
          else img = await pdf.embedJpg(bytes);
        } catch {
          continue;
        }

        const page = pdf.addPage([612, 792]);
        const m2 = 36;
        const header = `${ts.worker_name} — ${ts.job_text_clean} — ${ts.work_date}`;
        page.drawText(header, { x: m2, y: 792 - m2, size: 11, font: fontB });
        const fn = String(p.filename || "");
        page.drawText(fn, { x: m2, y: 792 - m2 - 14, size: 9, font, color: rgb(0.35, 0.35, 0.4) });

        const maxW = 612 - m2 * 2;
        const maxH = 792 - m2 * 2 - 32;
        const scale = Math.min(maxW / img.width, maxH / img.height);
        const wImg = img.width * scale;
        const hImg = img.height * scale;
        const x = (612 - wImg) / 2;
        const yImg = (792 - m2 - 28) - hImg;
        page.drawImage(img, { x, y: Math.max(m2, yImg), width: wImg, height: hImg });
      }
    }
  }


  const pdfBytes = await pdf.save();

  const df = dateFrom || (dates?.[0] ?? "");
  const dt = dateTo || (dates?.[(dates?.length || 1) - 1] ?? "");
  const who = employee && employee !== "All" ? employee : "Timesheets";
  const filename = sanitizeFilename(`${who} Timesheet - ${df}${dt ? " to " + dt : ""}.pdf`);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(Buffer.from(pdfBytes));
}
