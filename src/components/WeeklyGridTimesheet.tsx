import React, { useEffect, useMemo, useState } from "react";
import EmployeeTabs from "@/components/EmployeeTabs";
import ScrollableDropdown from "@/components/ScrollableDropdown";
import { EquipmentCatalogItem, flattenEquipmentCatalog, getAttachmentDropdownOptionsForEquipment, getAttachmentOptionsForEquipment, normalizeEquipmentCatalog } from "@/lib/equipmentCatalog";

export type WeeklyTimesheetType = "management" | "mechanic";

type SessionEmployee = { id: string; name: string; timesheet_type?: string | null };

type WeeklyRow = {
  id?: string;
  entry_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  job_label: string;
  equipment_label: string;
  attachment_label?: string;
  description: string;
};

type WeeklySheet = {
  id: string | null;
  week_start: string;
  status: "draft" | "submitted";
  submitted_at?: string | null;
  total_hours: number;
  entries: WeeklyRow[];
};

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day - 4 + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function addDays(ymd: string, days: number) {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatWeekRange(weekStart: string) {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-CA", opts)} → ${end.toLocaleDateString("en-CA", opts)}, ${end.getFullYear()}`;
}

function makeTimeOptions() {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

const TIME_OPTIONS = makeTimeOptions();

function formatTimeLabel(value: string) {
  const [hh, mm] = value.split(":").map(Number);
  if ([hh, mm].some((n) => Number.isNaN(n))) return value;
  const suffix = hh >= 12 ? "PM" : "AM";
  const hour12 = hh % 12 || 12;
  return `${hour12}:${String(mm).padStart(2, "0")} ${suffix}`;
}

function nextTimeOption(value: string) {
  const index = TIME_OPTIONS.indexOf(value);
  if (index >= 0 && index < TIME_OPTIONS.length - 1) return TIME_OPTIONS[index + 1];
  return TIME_OPTIONS[Math.min(Math.max(index, 0), TIME_OPTIONS.length - 1)] || "07:30";
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

function emptyRow(date: string): WeeklyRow {
  return {
    entry_date: date,
    start_time: "07:00",
    end_time: "07:30",
    hours: 0.5,
    job_label: "",
    equipment_label: "",
    attachment_label: "",
    description: "",
  };
}

export default function WeeklyGridTimesheet({
  employee,
  type,
  logout,
}: {
  employee: SessionEmployee;
  type: WeeklyTimesheetType;
  logout: () => Promise<void> | void;
}) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart());
  const [rows, setRows] = useState<WeeklyRow[]>([]);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [status, setStatus] = useState<"draft" | "submitted">("draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useNativeMobileTime, setUseNativeMobileTime] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const [equipmentCatalog, setEquipmentCatalog] = useState<EquipmentCatalogItem[]>([]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const totalHours = useMemo(() => rows.reduce((sum, row) => sum + Number(row.hours || 0), 0), [rows]);
  const equipmentOptions = useMemo(() => flattenEquipmentCatalog(equipmentCatalog), [equipmentCatalog]);
  const groupedRows = useMemo(() => {
    const map = new Map<string, WeeklyRow[]>();
    for (const day of weekDays) map.set(day, []);
    for (const row of rows) {
      const key = row.entry_date || weekStart;
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  }, [rows, weekDays, weekStart]);

  useEffect(() => {
    setCollapsedDays((prev) => {
      const next: Record<string, boolean> = {};
      for (const day of weekDays) next[day] = prev[day] ?? false;
      return next;
    });
  }, [weekDays]);

  function toggleDay(day: string) {
    setCollapsedDays((prev) => ({ ...prev, [day]: !prev[day] }));
  }

  useEffect(() => {
    if (type !== "mechanic") return;
    (async () => {
      try {
        const r = await fetch("/api/equipment-catalog");
        const j = await r.json();
        if (r.ok) setEquipmentCatalog(normalizeEquipmentCatalog(Array.isArray(j?.equipment) ? j.equipment : []));
      } catch {
        // ignore
      }
    })();
  }, [type]);


  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 760px), (pointer: coarse)");
    const sync = () => setUseNativeMobileTime(media.matches);
    sync();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      setMessage(null);
      try {
        const r = await fetch(`/api/me/weekly/current?weekStart=${encodeURIComponent(weekStart)}&type=${encodeURIComponent(type)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Failed to load week");
        const sheet = (j?.sheet || null) as WeeklySheet | null;
        if (sheet) {
          setSheetId(sheet.id || null);
          setStatus(sheet.status || "draft");
          setRows(
            Array.isArray(sheet.entries) && sheet.entries.length
              ? sheet.entries.map((row) => ({ ...row, attachment_label: row.attachment_label || "", hours: calcHours(row.start_time, row.end_time) }))
              : [emptyRow(weekStart)]
          );
        } else {
          setSheetId(null);
          setStatus("draft");
          setRows([emptyRow(weekStart)]);
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load week");
      } finally {
        setLoading(false);
      }
    })();
  }, [weekStart, type]);

  function updateRow(index: number, patch: Partial<WeeklyRow>) {
    setRows((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...patch };
      next.hours = calcHours(next.start_time, next.end_time);
      return next;
    }));
  }

  function addRow(date?: string) {
    const target = date || weekStart;
    setRows((prev) => {
      const dayRows = prev.filter((row) => (row.entry_date || weekStart) === target);
      const lastRow = dayRows[dayRows.length - 1];
      if (!lastRow?.end_time) return [...prev, emptyRow(target)];
      return [
        ...prev,
        {
          ...emptyRow(target),
          start_time: lastRow.end_time,
          end_time: nextTimeOption(lastRow.end_time),
          hours: calcHours(lastRow.end_time, nextTimeOption(lastRow.end_time)),
        },
      ];
    });
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function save(kind: "draft" | "submitted") {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const cleanRows = rows
        .map((row, index) => ({
          ...row,
          entry_date: row.entry_date || weekStart,
          start_time: row.start_time,
          end_time: row.end_time,
          hours: calcHours(row.start_time, row.end_time),
          sort_order: index,
        }))
        .filter((row) => {
          const label = type === "mechanic" ? row.equipment_label : row.job_label;
          return row.entry_date && row.start_time && row.end_time && row.hours > 0 && (label || "").trim() && (row.description || "").trim();
        });

      if (!cleanRows.length) throw new Error("Add at least one complete row before saving.");

      const r = await fetch("/api/me/weekly/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: weekStart, type, status: kind, rows: cleanRows }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to save week");
      setSheetId(j?.sheet?.id || null);
      setStatus(j?.sheet?.status || kind);
      setRows((j?.sheet?.entries || cleanRows).map((row: WeeklyRow) => ({ ...row, attachment_label: row.attachment_label || "", hours: calcHours(row.start_time, row.end_time) })));

      setMessage(kind === "submitted" ? "Week submitted." : "Draft saved.");
    } catch (e: any) {
      setError(e?.message || "Failed to save week");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page timesheet-page employee-shell">
      <div className="topbar">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }} />
        <button className="btn btn-ghost" onClick={logout}>Sign out</button>
      </div>

      <div className="tabcard">
        <EmployeeTabs active="entry" timesheetType={employee?.timesheet_type || type} />
        <section className="card tabcard-body employee-panel-card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h1 className="h1" style={{ margin: 0 }}>{type === "mechanic" ? "Mechanic Weekly Timesheet" : "Management Weekly Timesheet"}</h1>
              <div className="subtle">Signed in as <strong>{employee.name}</strong></div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-ghost employee-secondary-btn" onClick={() => setWeekStart(addDays(weekStart, -7))}>Previous Week</button>
              <button className="btn btn-ghost employee-secondary-btn" onClick={() => setWeekStart(getWeekStart())}>Current Week</button>
              <button className="btn btn-ghost employee-secondary-btn" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next Week</button>
            </div>
          </div>

          <div className="employee-panel-card" style={{ marginTop: 14, padding: 14 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{formatWeekRange(weekStart)}</div>
                <div className="subtle">Thursday → Wednesday • Status: {status === "submitted" ? "Submitted" : "Draft"}</div>
              </div>
              <div style={{ fontWeight: 900, fontSize: 28 }}>{totalHours.toFixed(1)} hrs</div>
            </div>
          </div>

          {error ? <div className="alert alert-bad" style={{ marginTop: 14 }}>{error}</div> : null}
          {message ? <div className="alert alert-good" style={{ marginTop: 14 }}>{message}</div> : null}
          {loading ? <div className="subtle" style={{ marginTop: 14 }}>Loading week…</div> : null}

          {!loading && weekDays.map((day) => {
            const dayRows = groupedRows.get(day) || [];
            const dayTotal = dayRows.reduce((sum, row) => sum + Number(row.hours || 0), 0);
            const isCollapsed = !!collapsedDays[day];
            return (
              <div key={day} className="employee-panel-card weekly-day-card" style={{ marginTop: 14, padding: 14 }}>
                <button
                  type="button"
                  className="weekly-day-toggle"
                  onClick={() => toggleDay(day)}
                  aria-expanded={!isCollapsed}
                  aria-controls={`weekly-day-panel-${day}`}
                >
                  <div className="weekly-day-toggle__main">
                    <div style={{ fontWeight: 800 }}>{new Date(day + "T00:00:00").toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric" })}</div>
                    <div className="subtle">{day}</div>
                  </div>
                  <div className="weekly-day-toggle__meta">
                    <div className="weekly-day-toggle__stats">
                      <span>{dayRows.length} {dayRows.length === 1 ? "entry" : "entries"}</span>
                      <span>{dayTotal.toFixed(1)} hrs</span>
                    </div>
                    <span className="weekly-day-toggle__icon" aria-hidden="true">{isCollapsed ? "+" : "−"}</span>
                  </div>
                </button>

                {!isCollapsed ? (
                  <div id={`weekly-day-panel-${day}`}>
                    <div style={{ display: "grid", gap: 10 }}>
                      {dayRows.map((row) => {
                        const index = rows.indexOf(row);
                        return (
                          <div key={`${day}-${index}`} className="employee-panel-card" style={{ padding: 12, border: "1px solid rgba(15,23,42,.08)" }}>
                            <div className="weekly-grid-row">
                              <label>
                                <div className="ts-label">Start</div>
                                {useNativeMobileTime ? (
                                  <div className="weekly-time-shell">
                                    <input
                                      className="input weekly-time-native"
                                      type="time"
                                      step={1800}
                                      lang="en-US"
                                      value={row.start_time}
                                      onChange={(e) => updateRow(index, { start_time: e.target.value })}
                                    />
                                  </div>
                                ) : (
                                  <select className="input" value={row.start_time} onChange={(e) => updateRow(index, { start_time: e.target.value })}>
                                    {TIME_OPTIONS.map((opt) => <option key={opt} value={opt}>{formatTimeLabel(opt)}</option>)}
                                  </select>
                                )}
                              </label>
                              <label>
                                <div className="ts-label">End</div>
                                {useNativeMobileTime ? (
                                  <div className="weekly-time-shell">
                                    <input
                                      className="input weekly-time-native"
                                      type="time"
                                      step={1800}
                                      lang="en-US"
                                      value={row.end_time}
                                      onChange={(e) => updateRow(index, { end_time: e.target.value })}
                                    />
                                  </div>
                                ) : (
                                  <select className="input" value={row.end_time} onChange={(e) => updateRow(index, { end_time: e.target.value })}>
                                    {TIME_OPTIONS.map((opt) => <option key={opt} value={opt}>{formatTimeLabel(opt)}</option>)}
                                  </select>
                                )}
                              </label>
                              <label>
                                <div className="ts-label">Hours</div>
                                <input className="input" value={row.hours.toFixed(2).replace(/\.00$/, "")}
                                  readOnly />
                              </label>
                              {type === "mechanic" ? (
                                <>
                                  <label className="weekly-grid-wide">
                                    <div className="ts-label">Equipment</div>
                                    <ScrollableDropdown
                                      value={row.equipment_label || ""}
                                      options={equipmentOptions}
                                      placeholder="Select equipment"
                                      onChange={(next) => {
                                        const nextAttachmentOptions = getAttachmentOptionsForEquipment(equipmentCatalog, next);
                                        const nextAttachment = nextAttachmentOptions.includes(row.attachment_label || "")
                                          ? (row.attachment_label || "")
                                          : "";
                                        updateRow(index, { equipment_label: next, attachment_label: nextAttachment });
                                      }}
                                    />
                                  </label>
                                  <label>
                                    <div className="ts-label">Attachment</div>
                                    <ScrollableDropdown
                                      value={row.attachment_label || ""}
                                      options={getAttachmentDropdownOptionsForEquipment(equipmentCatalog, row.equipment_label || "")}
                                      placeholder="None"
                                      onChange={(next) => updateRow(index, { attachment_label: next })}
                                    />
                                  </label>
                                  <label className="weekly-grid-description">
                                    <div className="ts-label">Description</div>
                                    <textarea className="input" value={row.description} onChange={(e) => updateRow(index, { description: e.target.value })} placeholder="Work performed / issue / repair completed" style={{ minHeight: 44 }} />
                                  </label>
                                </>
                              ) : (
                                <>
                                  <label className="weekly-grid-wide">
                                    <div className="ts-label">Job / Project / Location</div>
                                    <input className="input" value={row.job_label} onChange={(e) => updateRow(index, { job_label: e.target.value })} placeholder="Job number / location / client" />
                                  </label>
                                  <label className="weekly-grid-description">
                                    <div className="ts-label">Description</div>
                                    <textarea className="input" value={row.description} onChange={(e) => updateRow(index, { description: e.target.value })} placeholder="What you worked on" style={{ minHeight: 44 }} />
                                  </label>
                                </>
                              )}
                            </div>
                            <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                              <button className="btn employee-inline-btn" onClick={() => removeRow(index)} type="button">Remove</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="row" style={{ marginTop: 10 }}>
                      <button className="btn btn-ghost employee-secondary-btn" type="button" onClick={() => addRow(day)}>+ Add Row</button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          <div className="row" style={{ justifyContent: "space-between", marginTop: 16, gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-ghost employee-secondary-btn" type="button" onClick={() => addRow(weekStart)}>+ Add Another Entry</button>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary weekly-action-btn" disabled={saving} type="button" onClick={() => save("draft")}>{saving ? "Saving…" : sheetId ? "Save Changes" : "Save Draft"}</button>
              <button className="btn submit-btn weekly-action-btn" disabled={saving} type="button" onClick={() => save("submitted")}>{saving ? "Saving…" : status === "submitted" ? "Submitted" : "Submit Week"}</button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
