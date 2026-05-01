import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import AdminTabs from "../components/AdminTabs";
import ScrollableDropdown from "@/components/ScrollableDropdown";
import PageHeader from "@/components/ui/PageHeader";
import SectionHeader from "@/components/ui/SectionHeader";
import ModalFrame, { ModalSection } from "@/components/ui/ModalFrame";
import DataTable from "@/components/ui/DataTable";
import { JOB_TYPES } from "@/lib/constants";
import { flattenMaterialCatalog, normalizeMaterialCatalog } from "@/lib/materialCatalog";
import { EquipmentCatalogItem, flattenEquipmentCatalog, getAttachmentDropdownOptionsForEquipment, getAttachmentOptionsForEquipment, normalizeEquipmentCatalog } from "@/lib/equipmentCatalog";
import { autoGrowTextarea } from "@/lib/ui";

type TimesheetRow = {
  id: string;
  created_at?: string | null;
  work_date: string;
  week_start?: string | null;
  worker_name: string;
  type?: string | null;
  record_kind?: "standard" | "weekly" | null;
  weekly_type?: string | null;
  weekly_status?: string | null;
  entry_count?: number | null;
  week_end?: string | null;
  job_text_raw?: string | null;
  job_text_clean?: string | null;
  total_hours?: number | null;
  hours?: number | null;
  minutes?: number | null;
  equipment?: string | null;
  notes?: string | null;
  slip_paths?: string[] | null;
};

type EquipmentEditRow = {
  equipment: string;
  attachment: string | null;
  hours: number | null;
  notes: string | null;
  trucking_hours: number | null;
  trucking_notes: string | null;
};

type MaterialEditRow = { material: string; loads: number; notes: string | null };

type WeeklySheetDetail = {
  id: string;
  employee_name: string;
  week_start: string;
  timesheet_type: string;
  status: string;
  total_hours: number;
  submitted_at?: string | null;
};

type WeeklyEntryDetail = {
  id?: string;
  entry_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  job_label?: string | null;
  equipment_label?: string | null;
  attachment_label?: string | null;
  description?: string | null;
  sort_order?: number | null;
};

type WeekGroup = {
  key: string;
  id: string;
  worker_name: string;
  week_start: string;
  week_end: string;
  group_kind: "standard" | "weekly";
  type_label: string;
  weekly_type?: string | null;
  weekly_status?: string | null;
  total_hours: number;
  row_count: number;
  summary: string;
  rows: TimesheetRow[];
};

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekStartThursday(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const delta = (day - 4 + 7) % 7;
  d.setDate(d.getDate() - delta);
  return d.toISOString().slice(0, 10);
}

function calcHours(start: string, end: string) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return 0;
  return Math.round((mins / 60) * 100) / 100;
}

function firstLine(text: string | null | undefined) {
  return String(text || "").split(/\r?\n/)[0].trim();
}

function dayLabel(ymd: string) {
  const d = new Date(`${ymd}T00:00:00`);
  return d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
}

function jobSummaryOf(r: TimesheetRow): string {
  return firstLine(r.job_text_clean || r.job_text_raw) || "(blank)";
}

function emptyWeeklyRow(date: string): WeeklyEntryDetail {
  return { entry_date: date, start_time: "07:00", end_time: "07:30", hours: 0.5, job_label: "", equipment_label: "", attachment_label: "", description: "", sort_order: 0 };
}

export default function AdminPage() {
  const router = useRouter();
  const [adminPw, setAdminPw] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [employee, setEmployee] = useState("All");
  const [employeeNames, setEmployeeNames] = useState<string[]>([]);
  const [jobSummary, setJobSummary] = useState("All");
  const [rows, setRows] = useState<TimesheetRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editTimesheet, setEditTimesheet] = useState<any>(null);
  const [editEquip, setEditEquip] = useState<EquipmentEditRow[]>([]);
  const [editMat, setEditMat] = useState<MaterialEditRow[]>([]);
  const [equipmentCatalog, setEquipmentCatalog] = useState<EquipmentCatalogItem[]>([]);
  const [editPhotos, setEditPhotos] = useState<{ id?: string; path: string; filename?: string | null }[]>([]);
  const [materialOptions, setMaterialOptions] = useState<string[]>([]);
  const [uploadingSlips, setUploadingSlips] = useState(false);

  const [activeWeekGroup, setActiveWeekGroup] = useState<WeekGroup | null>(null);
  const [weeklyView, setWeeklyView] = useState<WeeklySheetDetail | null>(null);
  const [weeklyEntries, setWeeklyEntries] = useState<WeeklyEntryDetail[]>([]);
  const [weeklyViewLoading, setWeeklyViewLoading] = useState(false);
  const [weeklyDayDate, setWeeklyDayDate] = useState<string | null>(null);
  const [weeklyDayRows, setWeeklyDayRows] = useState<WeeklyEntryDetail[]>([]);
  const [weeklyDaySaving, setWeeklyDaySaving] = useState(false);
  const [editUnlocked, setEditUnlocked] = useState(false);
  const [weeklyDayEditing, setWeeklyDayEditing] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("pcc_admin_pw") : null;
    if (saved) setAdminPw(saved);
    if (!saved) router.replace("/admin/signin?returnTo=/admin");
  }, [router]);

  async function loadEmployees() {
    setErr(null);
    setStatus("Loading employees…");
    try {
      const res = await fetch("/api/admin/employees", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": adminPw }, body: JSON.stringify({}) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setEmployeeNames(Array.isArray(data?.names) ? data.names : []);
      setStatus(null);
    } catch (e: any) {
      setStatus(null);
      setErr(String(e?.message || e));
    }
  }

  function signOut() {
    try { window.localStorage.removeItem("pcc_admin_pw"); } catch {}
    router.replace("/admin/signin?returnTo=/admin");
  }

  function clearDates() { setDateFrom(""); setDateTo(""); }

  async function openEdit(id: string) {
    if (!adminPw) return;
    setErr(null); setStatus(null); setEditingId(id); setEditUnlocked(false); setEditLoading(true); setEditTimesheet(null); setEditEquip([]); setEditMat([]); setEditPhotos([]);
    try {
      const r = await fetch(`/api/admin/get-entry?id=${encodeURIComponent(id)}`, { headers: { "x-admin-password": adminPw } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Failed to load entry (HTTP ${r.status})`);
      const ts = j?.timesheet || {};
      setEditTimesheet({ worker_name: String(ts.worker_name || ""), work_date: String(ts.work_date || ""), job_type: String(ts.job_type || "Civil"), job_text_clean: String(ts.job_text_clean || ts.job_text_raw || ""), total_hours: typeof ts.total_hours === "number" ? ts.total_hours : Number(ts.total_hours || 0), notes: ts.notes ?? "" });
      setEditEquip((Array.isArray(j?.equipment) ? j.equipment : []).map((e: any) => ({ equipment: String(e.equipment || ""), attachment: e.attachment ?? null, hours: e.hours ?? null, notes: e.notes ?? null, trucking_hours: e.trucking_hours ?? null, trucking_notes: e.trucking_notes ?? null })));
      setEditMat((Array.isArray(j?.materials) ? j.materials : []).map((m: any) => ({ material: String(m.material || ""), loads: Number(m.loads || 0), notes: m.notes ?? null })));
      setEditPhotos((Array.isArray(j?.photos) ? j.photos : []).map((p: any) => ({ id: p.id, path: String(p.path || ""), filename: p.filename ?? null })).filter((p: any) => p.path));
    } catch (e: any) { setErr(String(e?.message || e)); setEditingId(null); } finally { setEditLoading(false); }
  }

  function closeEdit() { setEditingId(null); setEditUnlocked(false); setEditTimesheet(null); setEditEquip([]); setEditMat([]); setEditPhotos([]); }

  async function openWeeklyView(id: string) {
    if (!adminPw) return;
    setErr(null); setWeeklyView(null); setWeeklyEntries([]); setWeeklyViewLoading(true);
    try {
      const r = await fetch(`/api/admin/get-weekly-entry?id=${encodeURIComponent(id)}`, { headers: { "x-admin-password": adminPw } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Failed to load weekly timesheet (HTTP ${r.status})`);
      setWeeklyView(j?.sheet || null);
      setWeeklyEntries(Array.isArray(j?.entries) ? j.entries : []);
    } catch (e: any) { setErr(String(e?.message || e)); setWeeklyView(null); setWeeklyEntries([]); } finally { setWeeklyViewLoading(false); }
  }

  async function openWeekGroup(group: WeekGroup) {
    setActiveWeekGroup(group); setWeeklyDayDate(null); setWeeklyDayRows([]);
    if (group.group_kind === "weekly") await openWeeklyView(group.id); else { setWeeklyView(null); setWeeklyEntries([]); setWeeklyViewLoading(false); }
  }

  function closeWeekGroup() { setActiveWeekGroup(null); setWeeklyView(null); setWeeklyEntries([]); setWeeklyViewLoading(false); setWeeklyDayDate(null); setWeeklyDayEditing(false); setWeeklyDayRows([]); }
  function openWeeklyDay(date: string) { const dayRows = weeklyEntries.filter((entry) => entry.entry_date === date).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)); setWeeklyDayDate(date); setWeeklyDayEditing(false); setWeeklyDayRows(dayRows.length ? dayRows.map((row, idx) => ({ ...row, hours: calcHours(row.start_time, row.end_time), sort_order: idx })) : [emptyWeeklyRow(date)]); }
  function closeWeeklyDay() { setWeeklyDayDate(null); setWeeklyDayEditing(false); setWeeklyDayRows([]); }
  function updateWeeklyDayRow(index: number, patch: Partial<WeeklyEntryDetail>) { setWeeklyDayRows((prev) => prev.map((row, i) => i !== index ? row : { ...row, ...patch, hours: calcHours(String((patch.start_time ?? row.start_time) || ""), String((patch.end_time ?? row.end_time) || "")) })); }
  function addHalfHour(value: string) { const [hh, mm] = value.split(":").map(Number); if ([hh, mm].some((n) => Number.isNaN(n))) return "07:30"; const mins = Math.min(hh * 60 + mm + 30, 23 * 60 + 30); return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`; }
  function addWeeklyDayRow() { if (!weeklyDayDate) return; setWeeklyDayRows((prev) => { const last = prev[prev.length - 1]; const start = last?.end_time || "07:00"; const end = start === "23:30" ? "23:30" : addHalfHour(start); return [...prev, { ...emptyWeeklyRow(weeklyDayDate), start_time: start, end_time: end, hours: calcHours(start, end), sort_order: prev.length }]; }); }
  function removeWeeklyDayRow(index: number) { setWeeklyDayRows((prev) => prev.filter((_, i) => i !== index).map((row, idx) => ({ ...row, sort_order: idx }))); }

  async function saveWeeklyDay() {
    if (!weeklyView || !weeklyDayDate) return;
    setErr(null); setWeeklyDaySaving(true);
    try {
      const rowsPayload = weeklyDayRows.map((row, index) => ({ id: row.id, entry_date: weeklyDayDate, start_time: String(row.start_time || ""), end_time: String(row.end_time || ""), hours: calcHours(String(row.start_time || ""), String(row.end_time || "")), job_label: String(row.job_label || "").trim(), equipment_label: String(row.equipment_label || "").trim(), attachment_label: String(row.attachment_label || "").trim(), description: String(row.description || "").trim(), sort_order: index }));
      const r = await fetch("/api/admin/update-weekly-day", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": adminPw }, body: JSON.stringify({ id: weeklyView.id, entry_date: weeklyDayDate, rows: rowsPayload, timesheet_type: weeklyView.timesheet_type }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Failed to save day (HTTP ${r.status})`);
      await openWeeklyView(weeklyView.id); closeWeeklyDay(); setStatus("Weekly day saved."); await loadTimesheets();
    } catch (e: any) { setErr(String(e?.message || e)); } finally { setWeeklyDaySaving(false); }
  }

  const equipmentOptions = useMemo(() => flattenEquipmentCatalog(equipmentCatalog), [equipmentCatalog]);
  function addEquip() { const firstEquipment = equipmentOptions[0] || ""; const firstAttachment = null; setEditEquip((p) => [...p, { equipment: firstEquipment, attachment: firstAttachment, hours: null, notes: null, trucking_hours: null, trucking_notes: null }]); }
  function addMat() { setEditMat((p) => [...p, { material: materialOptions[0] || "", loads: 0, notes: null }]); }

  async function saveEdit() {
    if (!editingId || !editTimesheet) return;
    setErr(null); setStatus("Saving…");
    try {
      const payload = { id: editingId, patch: { worker_name: editTimesheet.worker_name, work_date: editTimesheet.work_date, job_type: editTimesheet.job_type, job_text_clean: editTimesheet.job_text_clean, total_hours: Number(editTimesheet.total_hours), notes: editTimesheet.notes ?? null }, equipment: editEquip.map((e) => { const isDump = e.equipment === "Dump Truck"; const attachmentOptions = getAttachmentOptionsForEquipment(equipmentCatalog, e.equipment); return { equipment: e.equipment, attachment: attachmentOptions.length ? (e.attachment || attachmentOptions[0]) : null, hours: isDump ? null : e.hours ?? null, notes: isDump ? null : e.notes ?? null, trucking_hours: isDump ? e.trucking_hours ?? null : null, trucking_notes: isDump ? e.trucking_notes ?? null : null }; }), materials: editMat.map((m) => ({ material: m.material, loads: Number(m.loads || 0), notes: m.notes ?? null })).filter((m) => !Number.isNaN(m.loads)) };
      const r = await fetch("/api/admin/update-entry", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": adminPw }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error || `Failed to save (HTTP ${r.status})`);
      setEditUnlocked(false); closeEdit(); setStatus("Saved."); await loadTimesheets();
    } catch (e: any) { setStatus(null); setErr(String(e?.message || e)); }
  }

  async function uploadEditSlips(fileList: FileList | null) {
    if (!editingId || !adminPw || !fileList || fileList.length === 0) return;
    setErr(null); setUploadingSlips(true);
    try {
      const fd = new FormData(); fd.append("timesheetId", editingId); Array.from(fileList).forEach((f) => fd.append("slips", f));
      const r = await fetch("/api/admin/upload-slip", { method: "POST", headers: { "x-admin-password": adminPw }, body: fd });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error || `Upload failed (HTTP ${r.status})`); await openEdit(editingId);
    } catch (e: any) { setErr(String(e?.message || e)); } finally { setUploadingSlips(false); }
  }

  async function deleteEntry(id: string, kind: "standard" | "weekly" = "standard") {
    if (!adminPw) return;
    const ok = confirm(kind === "weekly" ? "Delete this weekly timesheet? This cannot be undone." : "Delete this timesheet entry? This cannot be undone."); if (!ok) return;
    setErr(null); setStatus("Deleting…");
    try {
      const r = await fetch(kind === "weekly" ? "/api/admin/delete-weekly-entry" : "/api/admin/delete-entry", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": adminPw }, body: JSON.stringify({ id }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error || `Delete failed (HTTP ${r.status})`);
      if (activeWeekGroup?.id === id) closeWeekGroup(); setStatus("Deleted."); await loadTimesheets();
    } catch (e: any) { setStatus(null); setErr(String(e?.message || e)); }
  }

  async function exportBatchPDF() {
    if (!adminPw) return;
    setErr(null); setStatus("Preparing batch PDF…");
    try {
      const url = `/api/admin/pdf-batch?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&employee=${encodeURIComponent(employee)}`;
      const r = await fetch(url, { headers: { "x-admin-password": adminPw } });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error || `PDF export failed (HTTP ${r.status})`); }
      const blob = await r.blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `timesheets_${dateFrom || 'all'}_to_${dateTo || 'all'}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setStatus("Batch PDF downloaded.");
    } catch (e: any) { setStatus(null); setErr(String(e?.message || e)); }
  }

  async function downloadEntryPDF(id: string, workDate: string, worker: string, kind: "standard" | "weekly" = "standard") {
    if (!adminPw) return;
    setErr(null); setStatus("Preparing PDF…");
    try {
      const url = kind === "weekly" ? `/api/admin/pdf-weekly-entry?id=${encodeURIComponent(id)}` : `/api/admin/pdf-entry?id=${encodeURIComponent(id)}`;
      const r = await fetch(url, { headers: { "x-admin-password": adminPw } }); if (!r.ok) { const t = await r.text(); throw new Error(t || `PDF failed (HTTP ${r.status})`); }
      const blob = await r.blob(); const safeWorker = (worker || "employee").replace(/[^a-zA-Z0-9 _.-]/g, "_"); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `timesheet_${workDate}_${safeWorker}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setStatus("PDF downloaded.");
    } catch (e: any) { setStatus(null); setErr(String(e?.message || e)); }
  }

  async function downloadWeekGroupPDF(group: WeekGroup) {
    if (group.group_kind === "weekly") { await downloadEntryPDF(group.id, group.week_start, group.worker_name, "weekly"); return; }
    if (!adminPw) return; setErr(null); setStatus("Preparing week PDF…");
    try {
      const url = `/api/admin/pdf-batch?dateFrom=${encodeURIComponent(group.week_start)}&dateTo=${encodeURIComponent(group.week_end)}&employee=${encodeURIComponent(group.worker_name)}`;
      const r = await fetch(url, { headers: { "x-admin-password": adminPw } });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error || `PDF export failed (HTTP ${r.status})`); }
      const blob = await r.blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `timesheets_${group.week_start}_${group.worker_name.replace(/[^a-zA-Z0-9 _.-]/g, "_")}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setStatus("Week PDF downloaded.");
    } catch (e: any) { setStatus(null); setErr(String(e?.message || e)); }
  }

  async function setLockRange(locked: boolean) {
    if (!adminPw) return; setErr(null); setStatus(locked ? "Locking entries in range…" : "Unlocking entries in range…");
    try {
      const r = await fetch("/api/admin/lock-range", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": adminPw }, body: JSON.stringify({ dateFrom, dateTo, locked }) });
      const j = await r.json().catch(() => ({})); if (!r.ok || !j?.ok) throw new Error(j?.error || `Failed (HTTP ${r.status})`); setStatus(locked ? "Range locked." : "Range unlocked."); await loadTimesheets();
    } catch (e: any) { setStatus(null); setErr(String(e?.message || e)); }
  }

  async function loadMaterialOptions() { try { const r = await fetch("/api/material-catalog"); const j = await r.json(); if (r.ok) setMaterialOptions(flattenMaterialCatalog(normalizeMaterialCatalog(Array.isArray(j?.sources) ? j.sources : []))); } catch {} }
  async function loadEquipmentOptions() { try { const r = await fetch("/api/equipment-catalog"); const j = await r.json(); if (r.ok) setEquipmentCatalog(normalizeEquipmentCatalog(Array.isArray(j?.equipment) ? j.equipment : [])); } catch {} }

  async function loadTimesheets() {
    setErr(null); setStatus(null); setLoading(true);
    try {
      const res = await fetch("/api/admin/list", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": adminPw }, body: JSON.stringify({ dateFrom, dateTo }) });
      const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const got: TimesheetRow[] = Array.isArray(data?.rows) ? data.rows : []; setRows(got); setStatus(`Loaded ${got.length} records.`);
    } catch (e: any) { setErr(String(e?.message || e)); } finally { setLoading(false); }
  }

  useEffect(() => { if (adminPw) { loadEmployees(); loadMaterialOptions(); loadEquipmentOptions(); } }, [adminPw]);

  const filteredRows = useMemo(() => rows.filter((r) => (employee === "All" || r.worker_name === employee) && (jobSummary === "All" || jobSummaryOf(r) === jobSummary)), [rows, employee, jobSummary]);
  const jobSummaries = useMemo(() => Array.from(new Set(rows.map((r) => jobSummaryOf(r)))).sort((a, b) => a.localeCompare(b)), [rows]);

  const weekGroups = useMemo(() => {
    const map = new Map<string, WeekGroup>();
    for (const r of filteredRows) {
      const weekStart = String(r.week_start || weekStartThursday(r.work_date));
      const weekEnd = String(r.week_end || addDaysISO(weekStart, 6));
      const kind = r.record_kind === "weekly" ? "weekly" : "standard";
      const key = `${kind}::${r.worker_name}::${weekStart}::${r.weekly_type || ''}`;
      const totalHrs = typeof r.total_hours === "number" ? r.total_hours : (r.hours || 0) + ((r.minutes || 0) / 60);
      if (!map.has(key)) map.set(key, { key, id: r.id, worker_name: r.worker_name, week_start: weekStart, week_end: weekEnd, group_kind: kind, type_label: kind === "weekly" ? (r.type || "Weekly Grid") : "Standard Timesheets", weekly_type: r.weekly_type, weekly_status: r.weekly_status, total_hours: 0, row_count: 0, summary: "", rows: [] });
      const g = map.get(key)!; g.rows.push(r); g.total_hours += Number(totalHrs || 0); g.row_count += 1; if (kind === "weekly") { g.id = r.id; g.summary = `${r.weekly_status === "submitted" ? "Submitted" : "Draft"} • ${Number(r.entry_count || 0)} line entries`; }
    }
    for (const g of map.values()) if (g.group_kind === "standard") g.summary = Array.from(new Set(g.rows.map((r) => jobSummaryOf(r)).filter(Boolean))).slice(0, 3).join(" • ") || "Standard timesheets";
    return Array.from(map.values()).sort((a, b) => b.week_start.localeCompare(a.week_start) || a.worker_name.localeCompare(b.worker_name));
  }, [filteredRows]);

  const totalsByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredRows) { const hrs = typeof r.total_hours === "number" ? r.total_hours : (r.hours || 0) + ((r.minutes || 0) / 60); map.set(r.worker_name || "", (map.get(r.worker_name || "") || 0) + (Number.isFinite(hrs) ? hrs : 0)); }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredRows]);
  const grandTotal = useMemo(() => totalsByEmployee.reduce((sum, [, h]) => sum + h, 0), [totalsByEmployee]);
  const openWeekDays = useMemo(() => activeWeekGroup ? Array.from({ length: 7 }, (_, i) => addDaysISO(activeWeekGroup.week_start, i)) : [], [activeWeekGroup]);
  const standardRowsByDay = useMemo(() => { const map = new Map<string, TimesheetRow[]>(); if (!activeWeekGroup || activeWeekGroup.group_kind !== "standard") return map; for (const day of openWeekDays) map.set(day, []); for (const row of activeWeekGroup.rows) { const list = map.get(row.work_date) || []; list.push(row); map.set(row.work_date, list); } return map; }, [activeWeekGroup, openWeekDays]);
  const weeklyRowsByDay = useMemo(() => { const map = new Map<string, WeeklyEntryDetail[]>(); if (!activeWeekGroup || activeWeekGroup.group_kind !== "weekly") return map; for (const day of openWeekDays) map.set(day, []); for (const row of weeklyEntries) { const list = map.get(row.entry_date) || []; list.push(row); map.set(row.entry_date, list); } return map; }, [activeWeekGroup, openWeekDays, weeklyEntries]);

  return (
    <>
      <Head><title>PCC Timesheet — Admin</title></Head>
      <main className="admin-shell">
        <div className="tabcard">
          <AdminTabs active="timesheets" />
          <div className="card tabcard-body admin-panel-card">
            <PageHeader title="Admin" subtitle="Pay-period first view for standard + weekly grid timesheets" actions={<button className="btn btn-ghost" onClick={signOut}>Sign out</button>} />
            <div className="adminFilters">
              <div className="field"><div className="label">Date From</div><input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
              <div className="field"><div className="label">Date To</div><input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
              <div className="adminFiltersBtn"><button className="btn btn-ghost" onClick={clearDates} disabled={loading}>Clear Dates</button></div>
              <div className="field"><div className="label">Employee Filter</div><ScrollableDropdown value={employee} options={[{ value: "All", label: "All Employees" }, ...employeeNames]} onChange={(next) => setEmployee(next)} /></div>
              <div className="field"><div className="label">Job Summary Filter</div><ScrollableDropdown value={jobSummary} options={[{ value: "All", label: "All Jobs" }, ...jobSummaries]} onChange={(next) => setJobSummary(next)} /></div>
            </div>
            <div className="adminActions admin-actions">
              <button className="btn btn-primary" onClick={loadTimesheets} disabled={!adminPw || loading}>{loading ? "Loading…" : "Load Timesheets"}</button>
              <button className="btn btn-ghost" onClick={exportBatchPDF} disabled={!adminPw || loading}>Export Batch PDF</button>
              <button className="btn btn-ghost" onClick={() => setLockRange(true)} disabled={!adminPw || loading}>Lock Range</button>
              <button className="btn btn-ghost" onClick={() => setLockRange(false)} disabled={!adminPw || loading}>Unlock Range</button>
              <button className="btn btn-ghost" onClick={loadEmployees} disabled={!adminPw || loading}>Refresh Employees</button>
            </div>
            {status && <div className="muted ui-status-row">{status}</div>}
            {err && <div className="bad ui-status-row">{err}</div>}
          </div>

          <div className="card admin-panel-card ui-card-pad">
            <SectionHeader title="Totals" subtitle={`Grand total: ${grandTotal.toFixed(2)} hrs`} />
            <DataTable><table className="table"><thead><tr><th>Employee</th><th style={{ textAlign: "right" }}>Hours</th></tr></thead><tbody>{totalsByEmployee.map(([name, hrs]) => <tr key={name}><td>{name}</td><td style={{ textAlign: "right" }}>{hrs.toFixed(2)}</td></tr>)}</tbody></table></DataTable>
          </div>

          <div className="card admin-panel-card ui-card-pad">
            <SectionHeader title="Pay Periods / Weeks" subtitle={`${weekGroups.length} shown`} />
            <DataTable>
              <table className="table">
                <thead><tr><th>Pay Period</th><th>Employee</th><th>Type</th><th>Entries</th><th style={{ textAlign: "right" }}>Hours</th><th>Summary</th><th>Actions</th></tr></thead>
                <tbody>{weekGroups.map((group) => <tr key={group.key}><td>{group.week_start} → {group.week_end}</td><td>{group.worker_name}</td><td>{group.type_label}{group.group_kind === "weekly" ? <div className="muted" style={{ fontSize: 12 }}>{group.weekly_status === "submitted" ? "Submitted" : "Draft"}</div> : <div className="muted" style={{ fontSize: 12 }}>Week summary</div>}</td><td>{group.row_count}</td><td style={{ textAlign: "right" }}>{group.total_hours.toFixed(2)}</td><td style={{ maxWidth: 380 }}><div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.summary}</div></td><td><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="btn btn-ghost admin-table-action" style={{ padding: "6px 10px" }} onClick={() => downloadWeekGroupPDF(group)}>PDF</button><button className="btn btn-ghost admin-table-action" style={{ padding: "6px 10px" }} onClick={() => openWeekGroup(group)}>Open</button>{group.group_kind === "weekly" ? <button className="btn btn-ghost admin-inline-btn admin-table-action" style={{ padding: "6px 10px" }} onClick={() => deleteEntry(group.id, "weekly")}>Delete</button> : null}</div></td></tr>)}</tbody>
              </table>
            </DataTable>
            <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>Compact first layer, then day-by-day drill-in.</div>
          </div>

          {activeWeekGroup && (
            <ModalFrame onClose={closeWeekGroup} className="admin-edit-modal">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontWeight: 900, fontSize: 18 }}>{activeWeekGroup.type_label}</div><div className="muted" style={{ fontSize: 12 }}>{activeWeekGroup.worker_name} • {activeWeekGroup.week_start} → {activeWeekGroup.week_end} • {activeWeekGroup.total_hours.toFixed(2)} hrs</div></div><div className="row" style={{ gap: 8 }}><button className="btn btn-ghost" onClick={closeWeekGroup}>Close</button><button className="btn btn-ghost" onClick={() => downloadWeekGroupPDF(activeWeekGroup)}>PDF</button></div></div>
              {activeWeekGroup.group_kind === "weekly" && weeklyViewLoading ? <div className="muted" style={{ marginTop: 14 }}>Loading weekly breakdown…</div> : null}
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                {openWeekDays.map((day) => activeWeekGroup.group_kind === "standard" ? (() => { const dayRows = standardRowsByDay.get(day) || []; const dayHours = dayRows.reduce((sum, row) => sum + Number(row.total_hours || 0), 0); return <div key={day} className="card" style={{ padding: 12 }}><div><div style={{ fontWeight: 800 }}>{dayLabel(day)}</div><div className="muted" style={{ fontSize: 12 }}>{day} • {dayRows.length ? `${dayRows.length} entry${dayRows.length === 1 ? '' : 'ies'}` : "No entry"} • {dayHours.toFixed(2)} hrs</div></div><div style={{ marginTop: 8, display: "grid", gap: 8 }}>{dayRows.length === 0 ? <div className="muted">No standard entry for this day.</div> : dayRows.map((row) => <button key={row.id} type="button" onClick={() => openEdit(row.id)} className="admin-clickable-entry" style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.03)", textAlign: "left", color: "inherit", cursor: "pointer" }}><div style={{ fontWeight: 700 }}>{row.type || "Timesheet"} • {Number(row.total_hours || 0).toFixed(2)} hrs</div><div style={{ marginTop: 4 }}>{firstLine(row.job_text_clean || row.job_text_raw) || "—"}</div>{row.notes ? <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>{row.notes}</div> : null}</button>)}</div></div>; })() : (() => { const dayRows = weeklyRowsByDay.get(day) || []; const dayHours = dayRows.reduce((sum, row) => sum + Number(row.hours || 0), 0); const preview = firstLine(dayRows[0]?.job_label || dayRows[0]?.equipment_label || dayRows[0]?.description || ""); return <button key={day} type="button" className="card admin-clickable-entry" onClick={() => openWeeklyDay(day)} style={{ padding: 12, textAlign: "left", color: "inherit", cursor: "pointer", background: "rgba(255,255,255,0.03)" }}><div><div style={{ fontWeight: 800 }}>{dayLabel(day)}</div><div className="muted" style={{ fontSize: 12 }}>{day} • {dayRows.length} row{dayRows.length === 1 ? '' : 's'} • {dayHours.toFixed(2)} hrs</div></div><div style={{ marginTop: 8 }}>{dayRows.length === 0 ? <div className="muted">No weekly rows for this day yet.</div> : <div>{preview || "Day entries"}</div>}</div></button>; })())}
              </div>
            </ModalFrame>
          )}

          {weeklyDayDate && weeklyView && (
            <ModalFrame onClose={closeWeeklyDay} className="admin-edit-modal">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontWeight: 900, fontSize: 18 }}>{weeklyView.timesheet_type === "mechanic" ? "Mechanic Day" : "Management Day"}</div><div className="muted" style={{ fontSize: 12 }}>{weeklyView.employee_name} • {dayLabel(weeklyDayDate)} • {weeklyDayEditing ? "Editing" : "View only"}</div></div><div className="row" style={{ gap: 8 }}><button className="btn btn-ghost" onClick={closeWeeklyDay}>Close</button>{weeklyDayEditing ? <button className="btn primary" onClick={saveWeeklyDay} disabled={weeklyDaySaving}>{weeklyDaySaving ? "Saving…" : "Save"}</button> : <button className="btn primary" onClick={() => setWeeklyDayEditing(true)}>Edit</button>}</div></div>
              {!weeklyDayEditing ? <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>This day is locked until you click Edit.</div> : null}
              <div style={{ marginTop: 12, display: "grid", gap: 10, opacity: weeklyDayEditing ? 1 : 0.88, pointerEvents: weeklyDayEditing ? "auto" : "none" }}>{weeklyDayRows.map((row, idx) => { const isMechanic = weeklyView.timesheet_type === "mechanic"; const attachmentOptions = isMechanic ? getAttachmentOptionsForEquipment(equipmentCatalog, String(row.equipment_label || "")) : []; return <div key={row.id || idx} className="admin-soft-card" style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 10 }}><div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}><div><div className="label">Start</div><input className="input" type="time" step={1800} value={row.start_time || ""} onChange={(e) => updateWeeklyDayRow(idx, { start_time: e.target.value })} /></div><div><div className="label">End</div><input className="input" type="time" step={1800} value={row.end_time || ""} onChange={(e) => updateWeeklyDayRow(idx, { end_time: e.target.value })} /></div><div><div className="label">Hours</div><input className="input" value={Number(row.hours || 0).toFixed(2)} readOnly /></div>{isMechanic ? <><div style={{ minWidth: 220 }}><div className="label">Equipment</div><ScrollableDropdown value={String(row.equipment_label || "")} options={equipmentOptions} onChange={(next) => updateWeeklyDayRow(idx, { equipment_label: next, attachment_label: (() => { const opts = getAttachmentOptionsForEquipment(equipmentCatalog, next); return opts.includes(String(row.attachment_label || "")) ? String(row.attachment_label || "") : ""; })() })} /></div>{attachmentOptions.length ? <div style={{ minWidth: 200 }}><div className="label">Attachment</div><ScrollableDropdown value={String(row.attachment_label || "")} options={getAttachmentDropdownOptionsForEquipment(equipmentCatalog, String(row.equipment_label || ""))} placeholder="None" onChange={(next) => updateWeeklyDayRow(idx, { attachment_label: next })} /></div> : null}</> : <div style={{ minWidth: 260, flex: "1 1 260px" }}><div className="label">Job / Location</div><input className="input" value={String(row.job_label || "")} onChange={(e) => updateWeeklyDayRow(idx, { job_label: e.target.value })} /></div>}<button className="btn admin-inline-btn" onClick={() => removeWeeklyDayRow(idx)}>Remove</button></div><div style={{ marginTop: 8 }}><div className="label">Description</div><textarea className="input" rows={2} value={String(row.description || "")} onChange={(e) => updateWeeklyDayRow(idx, { description: e.target.value })} onInput={(e) => autoGrowTextarea(e.currentTarget)} onFocus={(e) => autoGrowTextarea(e.currentTarget)} style={{ width: "100%", boxSizing: "border-box" }} /></div></div>; })}<div>{weeklyDayEditing ? <button className="btn btn-ghost" onClick={addWeeklyDayRow}>+ Add Row</button> : null}</div></div>
            </ModalFrame>
          )}

        {editingId && (
          <ModalFrame onClose={closeEdit} className="admin-edit-modal">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>Timesheet Details</div>
                  <div className="muted" style={{ fontSize: 12 }}>{editUnlocked ? "Editing" : "View only"} (affects PDFs + exports)</div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-ghost" onClick={closeEdit}>Close</button>
                  {editUnlocked ? <button className="btn primary" onClick={saveEdit} disabled={editLoading || !editTimesheet}>Save</button> : <button className="btn primary" onClick={() => setEditUnlocked(true)} disabled={editLoading || !editTimesheet}>Edit</button>}
                </div>
              </div>

              {editLoading && <div className="muted" style={{ marginTop: 12 }}>Loading…</div>}
              {!editLoading && editTimesheet && (
                <div style={{ marginTop: 12 }}>
                  {!editUnlocked ? <div className="muted" style={{ marginBottom: 10, fontSize: 12 }}>This timesheet is locked until you click Edit.</div> : null}
                  <div style={{ opacity: editUnlocked ? 1 : 0.88, pointerEvents: editUnlocked ? "auto" : "none" }}>
                  <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 220 }}>
                      <div className="label">Employee Name</div>
                      <input className="input" value={editTimesheet.worker_name} onChange={(e) => setEditTimesheet((p: any) => ({ ...p, worker_name: e.target.value }))} />
                    </div>
                    <div>
                      <div className="label">Date</div>
                      <input className="input" type="date" value={editTimesheet.work_date} onChange={(e) => setEditTimesheet((p: any) => ({ ...p, work_date: e.target.value }))} />
                    </div>
                    <div>
                      <div className="label">Job Type</div>
                      <ScrollableDropdown
                        value={editTimesheet.job_type}
                        options={JOB_TYPES}
                        onChange={(next) => setEditTimesheet((p: any) => ({ ...p, job_type: next }))}
                      />
                    </div>
                    <div>
                      <div className="label">Total Hours</div>
                      <input className="input" inputMode="decimal" value={String(editTimesheet.total_hours ?? "")} onChange={(e) => setEditTimesheet((p: any) => ({ ...p, total_hours: e.target.value }))} />
                    </div>
                    <div style={{ width: "100%" }}>
                      <div className="label">Job / Location</div>
                      <textarea ref={(el) => { if (el) autoGrowTextarea(el); }} className="input" style={{minHeight: 70, boxSizing: "border-box", width: "100%"}} value={editTimesheet.job_text_clean || ""} onChange={(e) => setEditTimesheet((p: any) => ({ ...p, job_text_clean: e.target.value }))} />
                    </div>
                    <div style={{minHeight: 70, boxSizing: "border-box", gridColumn: "1 / -1", width: "100%", flex: "1 1 100%"}}>
                      <div className="label">Notes</div>
                      <textarea rows={1} className="input" value={editTimesheet.notes || ""} onChange={(e) => setEditTimesheet((p: any) => ({ ...p, notes: e.target.value }))} onInput={(e) => autoGrowTextarea(e.currentTarget)} onFocus={(e) => autoGrowTextarea(e.currentTarget)} style={{minHeight: 70, boxSizing: "border-box", width: "100%", display: "block", }}></textarea>
                    </div>
                  </div>

                  <ModalSection>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 900 }}>Equipment</div>
                      {editUnlocked ? <button className="btn btn-ghost" onClick={addEquip}>+ Add Equipment</button> : null}
                    </div>
                    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                      {editEquip.map((e, idx) => {
                        const isDump = e.equipment === "Dump Truck";
                        const attachmentOptions = getAttachmentOptionsForEquipment(equipmentCatalog, e.equipment);
                        const showAttachment = attachmentOptions.length > 0;
                        return (
                          <div key={idx} className="admin-soft-card" style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 10 }}>
                            <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                              <div style={{ minWidth: 220 }}>
                                <div className="label">Equipment</div>
                                <ScrollableDropdown
                                  value={e.equipment}
                                  options={equipmentOptions}
                                  onChange={(next) =>
                                    setEditEquip((p) => p.map((x, i) => i !== idx ? x : { ...x, equipment: next, attachment: (() => { const opts = getAttachmentOptionsForEquipment(equipmentCatalog, next); return opts.length ? (opts.includes(x.attachment || "") ? (x.attachment || "") : "") : null; })() }))
                                  }
                                />
                              </div>

                              {showAttachment && (
                                <div style={{ minWidth: 200 }}>
                                  <div className="label">Attachment</div>
                                  <ScrollableDropdown
                                    value={e.attachment || attachmentOptions[0] || ""}
                                    options={attachmentOptions}
                                    onChange={(next) =>
                                      setEditEquip((p) => p.map((x, i) => (i === idx ? { ...x, attachment: next } : x)))
                                    }
                                  />
                                </div>
                              )}

                              {!isDump && (
                                <div>
                                  <div className="label">Hours</div>
                                  <input className="input" inputMode="decimal" value={e.hours ?? ""} onChange={(ev) => setEditEquip((p) => p.map((x, i) => i === idx ? ({ ...x, hours: ev.target.value === "" ? null : Number(ev.target.value) }) : x))} />
                                </div>
                              )}

                              {isDump && (
                                <div>
                                  <div className="label">Trucking Hours</div>
                                  <input className="input" inputMode="decimal" value={e.trucking_hours ?? ""} onChange={(ev) => setEditEquip((p) => p.map((x, i) => i === idx ? ({ ...x, trucking_hours: ev.target.value === "" ? null : Number(ev.target.value) }) : x))} />
                                </div>
                              )}

                              {editUnlocked ? <button className="btn admin-inline-btn" onClick={() => setEditEquip((p) => p.filter((_, i) => i !== idx))}>Remove</button> : null}
                            </div>

                            {!isDump && (
                              <div style={{ marginTop: 8 }}>
                                <div className="label">Notes</div>
                                <textarea ref={(el) => { if (el) autoGrowTextarea(el); }} rows={1} className="input" value={e.notes || ""} onChange={(ev) => setEditEquip((p) => p.map((x, i) => i === idx ? ({ ...x, notes: ev.target.value }) : x))} onInput={(e) => autoGrowTextarea(e.currentTarget)} onFocus={(e) => autoGrowTextarea(e.currentTarget)} style={{width: "100%", resize: "none", overflow: "hidden", boxSizing: "border-box"}}></textarea>
                              </div>
                            )}

                            {isDump && (
                              <div style={{ marginTop: 8 }}>
                                <div className="label">Trucking Notes</div>
                                <textarea ref={(el) => { if (el) autoGrowTextarea(el); }} rows={1} className="input" value={e.trucking_notes || ""} onChange={(ev) => setEditEquip((p) => p.map((x, i) => i === idx ? ({ ...x, trucking_notes: ev.target.value }) : x))} onInput={(e) => autoGrowTextarea(e.currentTarget)} onFocus={(e) => autoGrowTextarea(e.currentTarget)} style={{width: "100%", resize: "none", overflow: "hidden", boxSizing: "border-box"}}></textarea>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ModalSection>

                  <ModalSection>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 900 }}>Materials</div>
                      {editUnlocked ? <button className="btn btn-ghost" onClick={addMat}>+ Add Material</button> : null}
                    </div>
                    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                      {editMat.map((m, idx) => (
                        <div key={idx} className="admin-soft-card" style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 10 }}>
                          <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                            <div style={{ minWidth: 260 }}>
                              <div className="label">Material</div>
                              <ScrollableDropdown
                                value={m.material}
                                options={materialOptions}
                                onChange={(next) =>
                                  setEditMat((p) => p.map((x, i) => (i === idx ? { ...x, material: next } : x)))
                                }
                              />
                            </div>
                            <div>
                              <div className="label">Loads</div>
                              <input className="input" inputMode="decimal" value={m.loads ?? 0} onChange={(ev) => setEditMat((p) => p.map((x, i) => i === idx ? ({ ...x, loads: Number(ev.target.value) }) : x))} />
                            </div>
                            {editUnlocked ? <button className="btn admin-inline-btn" onClick={() => setEditMat((p) => p.filter((_, i) => i !== idx))}>Remove</button> : null}
                          </div>
                          <div style={{ marginTop: 8 }}>
                            <div className="label">Notes</div>
                            <textarea ref={(el) => { if (el) autoGrowTextarea(el); }} rows={1} className="input" value={m.notes || ""} onChange={(ev) => setEditMat((p) => p.map((x, i) => i === idx ? ({ ...x, notes: ev.target.value }) : x))} onInput={(e) => autoGrowTextarea(e.currentTarget)} onFocus={(e) => autoGrowTextarea(e.currentTarget)} style={{width: "100%", resize: "none", overflow: "hidden", boxSizing: "border-box"}}></textarea>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ModalSection>

                  {/* Keep modules in the same order as the main timesheet: Info → Equipment → Materials → Slips */}
                  <ModalSection>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 900 }}>Slips</div>
                      {editUnlocked ? <label className="btn btn-ghost" style={{ padding: "6px 10px" }}>
                        {uploadingSlips ? "Uploading…" : "+ Add Slip"}
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          multiple
                          style={{ display: "none" }}
                          disabled={uploadingSlips}
                          onChange={(e) => {
                            const files = e.target.files;
                            // allow re-uploading the same file again later
                            e.target.value = "";
                            uploadEditSlips(files);
                          }}
                        />
                      </label> : null}
                    </div>

                    {editPhotos.length === 0 ? (
                      <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>No slips attached.</div>
                    ) : (
                      <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {editPhotos.map((p, i) => (
                          <a
                            key={p.path}
                            href={`/admin/slip?path=${encodeURIComponent(p.path)}&employee=${encodeURIComponent(editTimesheet.worker_name)}&job=${encodeURIComponent(editTimesheet.job_text_clean || "")}&date=${encodeURIComponent(editTimesheet.work_date)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="pill"
                            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.92)" }}
                          >
                            Slip {i + 1}
                            {p.filename ? <span style={{ opacity: 0.7, fontSize: 12 }}>({p.filename})</span> : null}
                          </a>
                        ))}
                      </div>
                    )}
                  </ModalSection>
                  </div>
                </div>
              )}
          </ModalFrame>
        )}
        </div>
      </main>
      <style jsx>{`
        .admin-clickable-entry {
          transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
        }
        .admin-clickable-entry:hover {
          background: rgba(255,255,255,0.07) !important;
          border-color: rgba(255,255,255,0.18) !important;
          transform: translateY(-1px);
        }
      `}</style>
    </>
  );
}