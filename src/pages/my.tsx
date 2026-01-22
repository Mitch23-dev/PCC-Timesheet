import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { ATTACHMENTS, DUMP_TRUCK_ATTACHMENTS, EQUIPMENT, EXCAVATORS, JOB_TYPES, MATERIALS, SKID_STEER_ATTACHMENTS } from "@/lib/constants";
import EmployeeTabs from "@/components/EmployeeTabs";
import ScrollableDropdown from "@/components/ScrollableDropdown";

// Auto-grow for mobile note fields (wrap + expand). Keeps styling unchanged.
function autoGrowTextarea(el: HTMLTextAreaElement) {
  // Robust auto-grow: avoids descender clipping and mobile multi-line clipping.
  const apply = () => {
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + border}px`;
  };
  apply();
  // Mobile browsers sometimes update scrollHeight after layout; run again next frame.
  requestAnimationFrame(apply);
}




type Row = {
  id: string;
  work_date: string;
  week_start: string;
  job_type: string;
  job_text_clean: string;
  // Some deployments store the raw job text in a separate column.
  // Keep it optional so the UI compiles against either schema.
  job_text_raw?: string | null;
  total_hours: number;
  notes: string | null;
  locked: boolean;
};

type Equip = {
  equipment: string;
  attachment: string | null;
  hours: number | null;
  notes: string | null;
  trucking_hours: number | null;
  trucking_notes: string | null;
};

type Mat = {
  material: string;
  loads: number;
  notes: string | null;
};

type Photo = { path: string; filename: string };

function fmtWeek(startYmd: string) {
  const start = new Date(startYmd + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  // Example: "Jan 15 → Jan 21 - 2026"
  const monDay = (x: Date) =>
    x.toLocaleDateString("en-CA", { month: "short", day: "2-digit" }).replace(/\s+/g, " ");
  const year = end.getFullYear();

  // If a week ever straddles years, show both years to avoid confusion.
  if (start.getFullYear() !== end.getFullYear()) {
    const full = (x: Date) =>
      x.toLocaleDateString("en-CA", { month: "short", day: "2-digit", year: "numeric" }).replace(/\s+/g, " ");
    return `${full(start)} → ${full(end)}`;
  }

  return `${monDay(start)} → ${monDay(end)} - ${year}`;
}

function fmtDayName(ymd: string) {
  const d = new Date(ymd + "T00:00:00");
  return d.toLocaleDateString("en-CA", { weekday: "long" });
}

export default function MyTimesheets() {
  const router = useRouter();
  const [employee, setEmployee] = useState<{ id: string; name: string } | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Edit modal
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [slipUploading, setSlipUploading] = useState(false);
  const [slipErr, setSlipErr] = useState<string | null>(null);

  const [editEquip, setEditEquip] = useState<Equip[]>([]);
  const [editMat, setEditMat] = useState<Mat[]>([]);
  const [editPhotos, setEditPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const s = await fetch("/api/me/session");
        const sj = await s.json();
        if (!sj?.loggedIn) {
          router.replace("/");
          return;
        }
        setEmployee(sj.employee);
        await load();
      } catch {
        router.replace("/");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setErr(null);
    const r = await fetch("/api/me/list");
    const j = await r.json();
    if (!r.ok) {
      setErr(j?.error || "Failed to load");
      return;
    }
    setRows(j.rows || []);
  }

  const ytdHours = useMemo(() => {
    const year = new Date().getFullYear();
    return (rows || [])
      .filter((r) => new Date(r.work_date).getFullYear() === year)
      .reduce((sum, r) => sum + Number(r.total_hours || 0), 0);
  }, [rows]);

  const allTimeHours = useMemo(() => {
    return (rows || []).reduce((sum, r) => sum + Number(r.total_hours || 0), 0);
  }, [rows]);

  const weeks = useMemo(() => {
    const map = new Map<string, { week_start: string; locked: boolean; total: number; entries: Row[] }>();
    for (const r of rows || []) {
      const key = r.week_start || r.work_date;
      const cur = map.get(key) || { week_start: key, locked: false, total: 0, entries: [] };
      cur.total += Number(r.total_hours || 0);
      cur.locked = cur.locked || !!r.locked;
      cur.entries.push(r);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => (a.week_start < b.week_start ? 1 : -1));
  }, [rows]);

  async function openEdit(id: string) {
    setEditingId(id);
    setEditLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/me/get-entry?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load entry");
      setEditData(data.timesheet);
      setEditEquip(
        (data.equipment || []).map((e: any) => ({
          equipment: e.equipment,
          attachment: e.attachment,
          hours: e.hours,
          notes: e.notes,
          trucking_hours: e.trucking_hours,
          trucking_notes: e.trucking_notes,
        }))
      );
      setEditMat((data.materials || []).map((m: any) => ({ material: m.material, loads: m.loads, notes: m.notes })));
      setEditPhotos(data.photos || []);

      setEditPhotos((data.photos || []).map((p: any) => ({ path: p.path, filename: p.filename })));
    } catch (e: any) {
      setErr(e?.message || "Error");
      setEditingId(null);
    } finally {
      setEditLoading(false);
    }
  }

  function closeEdit() {
    setEditingId(null);
    setEditData(null);
    setEditEquip([]);
    setEditMat([]);
    setEditPhotos([]);
  }

  function addEquip() {
    setEditEquip((p) => [
      ...p,
      {
        equipment: "Komatsu 138 (Old)",
        attachment: "None",
        hours: null,
        notes: null,
        trucking_hours: null,
        trucking_notes: null,
      },
    ]);
  }

  function addMat() {
    setEditMat((p) => [...p, { material: `Conrads - 3/4" Clear Stone`, loads: 0, notes: null }]);
  }

  async function saveEdit() {
    if (!editingId || !editData) return;
    setErr(null);
    const payload = {
      id: editingId,
      patch: {
        work_date: editData.work_date,
        job_type: editData.job_type,
        job_text_clean: editData.job_text_clean,
        job_text_raw: editData.job_text_raw ?? editData.job_text_clean,
        total_hours: Number(editData.total_hours),
        notes: editData.notes ?? null,
      },
      equipment: editEquip.map((e) => {
        const isDump = e.equipment === "Dump Truck";
        const isSkid = e.equipment === "Kubota Skid Steer" || e.equipment === "John Deere Skid Steer";
        return {
          equipment: e.equipment,
          attachment: EXCAVATORS.has(e.equipment) || isDump || isSkid ? e.attachment || "None" : null,
          hours: isDump ? null : e.hours ?? null,
          notes: isDump ? null : e.notes ?? null,
          trucking_hours: isDump ? e.trucking_hours ?? null : null,
          trucking_notes: isDump ? e.trucking_notes ?? null : null,
        };
      }),
      materials: editMat
        .map((m) => ({ material: m.material, loads: Number(m.loads || 0), notes: m.notes ?? null }))
        .filter((m) => !Number.isNaN(m.loads) && m.loads !== 0),
    };

    const res = await fetch("/api/me/update-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data?.error || "Failed to save");
      return;
    }
    closeEdit();
    await load();
  }

  async function uploadSlips(files: FileList | null) {
    if (!editingId) return;
    if (!files || files.length === 0) return;
    setSlipErr(null);
    setSlipUploading(true);
    try {
      const fd = new FormData();
      fd.append("timesheetId", editingId);
      for (let i = 0; i < files.length; i++) fd.append("files", files[i]);

      const res = await fetch("/api/me/upload-slip", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Upload failed");

      // Refresh slip list
      const ref = await fetch(`/api/me/get-entry?id=${encodeURIComponent(editingId)}`);
      const data = await ref.json();
      if (ref.ok) setEditPhotos(data.photos || []);
    } catch (e: any) {
      setSlipErr(e?.message || "Upload failed");
    } finally {
      setSlipUploading(false);
    }
  }


  return (
    <main className="page">
      <div className="tabcard" style={{ marginBottom: 14 }}>
        <EmployeeTabs active="my" />
        <section className="card tabcard-body">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h1 className="h1" style={{ margin: 0 }}>My Timesheets</h1>
              {employee && <div className="subtle">Signed in as <strong>{employee.name}</strong></div>}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" onClick={async () => {
                try { await fetch('/api/me/logout', { method: 'POST' }); } catch {}
                router.replace('/');
              }}>
                Sign out
              </button>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>Total Hours (YTD)</div>
                <div className="subtle">{new Date().getFullYear()}</div>
              </div>
              <div style={{ fontWeight: 900, fontSize: 28 }}>{ytdHours.toFixed(1)}</div>
            </div>

            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Total Hours (All Time)</div>
                <div className="subtle">Since start</div>
              </div>
              <div style={{ fontWeight: 900, fontSize: 22 }}>{allTimeHours.toFixed(1)}</div>
            </div>
          </div>
        </section>
      </div>

      {err && <div className="alert alert-bad" style={{ marginBottom: 14 }}>{err}</div>}

      <section className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Weekly Summary (Thu → Wed)</h2>
          <button className="btn btn-primary" onClick={load}>Refresh</button>
        </div>

        {!rows && <div className="subtle" style={{ marginTop: 12 }}>Loading…</div>}
        {rows && weeks.length === 0 && <div className="subtle" style={{ marginTop: 12 }}>No timesheets yet.</div>}

        {weeks.map((w) => (
          <div key={w.week_start} style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <div>
                <div style={{ fontWeight: 800 }}>{fmtWeek(w.week_start)}</div>
                <div className="subtle">{w.locked ? "Locked" : "Editable"}</div>
              </div>
              <div style={{ fontWeight: 900 }}>{w.total.toFixed(1)} hrs</div>
            </div>

            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
              {w.entries
                .sort((a, b) => (a.work_date < b.work_date ? 1 : -1))
                .map((r) => {
                  const jobLines = String(r.job_text_clean || r.job_text_raw || "").split(/\r?\n/);
                  const jobNo = (jobLines[0] || "").trim();
                  const secondary = (jobLines[1] || "").trim();

                  return (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "10px 12px", border: "1px solid #eee", borderRadius: 12 }}>
                      {/* Left label: keep same horizontal position, but align the primary line vertically with the hours on the right.
                          Secondary line is absolutely positioned so it doesn't affect vertical centering of the primary line. */}
                      <div style={{ minWidth: 0, position: "relative" }}>
                        <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {fmtDayName(r.work_date)} · {jobNo}
                        </div>
                        <div
                          className="subtle"
                          style={{
                            position: "absolute",
                            left: 0,
                            top: "50%",
                            transform: "translateY(10px)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            right: 0,
                          }}
                        >
                          {secondary || "\u00A0"}
                        </div>
                      </div>
                      <div className="my-entry-actions">
                        <div className="my-entry-hours">{Number(r.total_hours || 0).toFixed(1)}h</div>
                        <button className="btn btn-ghost" onClick={() => openEdit(r.id)} disabled={!!r.locked}>Edit</button>
                        <button className="btn btn-primary" onClick={() => openEdit(r.id)}>View</button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </section>

      {editingId && (
        <div className="modal-backdrop" onClick={closeEdit}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Timesheet</h2>
              <button className="btn btn-ghost" onClick={closeEdit}>Close</button>
            </div>

            {editLoading && <div className="subtle" style={{ marginTop: 12 }}>Loading…</div>}
            {!editLoading && editData && (
              <div style={{ marginTop: 12 }}>
                <div className="ts-grid">
                  <label>
                    <div className="ts-label">Date</div>
                    <input className="input" type="date" value={editData.work_date} onChange={(e) => setEditData((p: any) => ({ ...p, work_date: e.target.value }))} />
                  </label>
                  <label>
                    <div className="ts-label">Job Type</div>
                    <ScrollableDropdown
                      value={editData.job_type}
                      options={JOB_TYPES}
                      onChange={(next) => setEditData((p: any) => ({ ...p, job_type: next }))}
                    />
                  </label>
                  <label>
                    <div className="ts-label">Total Hours</div>
                    <input className="input" inputMode="decimal" value={String(editData.total_hours ?? "")} onChange={(e) => setEditData((p: any) => ({ ...p, total_hours: e.target.value }))} />
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    <div className="ts-label">Job / Location</div>
                    <textarea ref={(el) => { if (el) autoGrowTextarea(el); }} className="input" style={{minHeight: 70, boxSizing: "border-box"}} value={editData.job_text_clean || ""} onChange={(e) => setEditData((p: any) => ({ ...p, job_text_clean: e.target.value }))} />
                  </label>
                  <label style={{minHeight: 70, boxSizing: "border-box", gridColumn: "1 / -1"}}>
                    <div className="ts-label">Notes</div>
                    <textarea rows={1} className="input" value={editData.notes || ""} onChange={(e) => setEditData((p: any) => ({ ...p, notes: e.target.value }))} onInput={(e) => autoGrowTextarea(e.currentTarget)} onFocus={(e) => autoGrowTextarea(e.currentTarget)} style={{minHeight: 70, boxSizing: "border-box"}}></textarea>
                  </label>
                </div>

                <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>Equipment</h3>
                    <button className="btn btn-primary" onClick={addEquip}>+ Add Equipment</button>
                  </div>
                  {editEquip.map((e, idx) => {
                    const isDump = e.equipment === "Dump Truck";
                    const isSkid = e.equipment === "Kubota Skid Steer" || e.equipment === "John Deere Skid Steer";
                    const isExc = EXCAVATORS.has(e.equipment);
                    return (
                      <div key={idx} style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f0f0f0" }}>
                        <div className="equip-grid">
                          <label>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>Equipment</div>
                            <ScrollableDropdown
                              value={e.equipment || ""}
                              options={EQUIPMENT}
                              placeholder="Select equipment"
                              onChange={(next) => setEditEquip((p) => {
                                const copy = [...p];
                                copy[idx] = { ...copy[idx], equipment: next };
                                return copy;
                              })}
                            />
                          </label>

                          {(isExc || isDump || isSkid) ? (
                            <label>
                              <div style={{ fontWeight: 700, marginBottom: 6 }}>Attachment</div>
                              <ScrollableDropdown
                                value={e.attachment || "None"}
                                options={(isDump ? DUMP_TRUCK_ATTACHMENTS : isSkid ? SKID_STEER_ATTACHMENTS : ATTACHMENTS)}
                                onChange={(next) => setEditEquip((p) => {
                                  const copy = [...p];
                                  copy[idx] = { ...copy[idx], attachment: next };
                                  return copy;
                                })}
                              />
                            </label>
                          ) : <div />}

                          {!isDump ? (
                            <label className="equip-hours">
                              <div style={{ fontWeight: 700, marginBottom: 6 }}>Hours</div>
                              <input className="input" inputMode="decimal" value={String(e.hours ?? "")} onChange={(ev) => setEditEquip((p) => {
                                const c = [...p];
                                c[idx] = { ...c[idx], hours: ev.target.value === "" ? null : Number(ev.target.value) };
                                return c;
                              })} />
                            </label>
                          ) : (
                            <label className="equip-hours">
                              <div style={{ fontWeight: 700, marginBottom: 6 }}>Trucking Hours</div>
                              <input className="input" inputMode="decimal" value={String(e.trucking_hours ?? "")} onChange={(ev) => setEditEquip((p) => {
                                const c = [...p];
                                c[idx] = { ...c[idx], trucking_hours: ev.target.value === "" ? null : Number(ev.target.value) };
                                return c;
                              })} />
                            </label>
                          )}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10, marginTop: 10, alignItems: "end" }}>
                          <label>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>{isDump ? "Trucking Notes" : "Notes"}</div>
                            <textarea ref={(el) => { if (el) autoGrowTextarea(el); }} rows={1} className="input" value={isDump ? (e.trucking_notes || "") : (e.notes || "")} onChange={(ev) => setEditEquip((p) => {
                              const c = [...p];
                              if (isDump) c[idx] = { ...c[idx], trucking_notes: ev.target.value };
                              else c[idx] = { ...c[idx], notes: ev.target.value };
                              return c;
                            })} style={{width: "100%", resize: "none", overflow: "hidden", boxSizing: "border-box"}} onInput={(e) => autoGrowTextarea(e.currentTarget)} onFocus={(e) => autoGrowTextarea(e.currentTarget)}></textarea>
                          </label>
                          <button className="btn btn-primary" onClick={() => setEditEquip((p) => p.filter((_, i) => i !== idx))}>Remove</button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>Materials</h3>
                    <button className="btn btn-primary" onClick={addMat}>+ Add Material</button>
                  </div>
                  {editMat.map((m, idx) => (
                    <div key={idx} className="materials-item" style={{ marginTop: 10 }}>
                      <div className="materials-top">
                        <label className="materials-material">
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>Material</div>
                          <ScrollableDropdown
                            value={m.material || ""}
                            options={MATERIALS}
                            placeholder="Select material"
                            onChange={(material) => setEditMat((p) => {
                              const copy = [...p];
                              copy[idx] = { ...copy[idx], material };
                              return copy;
                            })}
                          />
                        </label>

                        <label className="materials-loads">
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>Loads</div>
                          <input
                            className="input"
                            inputMode="decimal"
                            value={String(m.loads ?? 0)}
                            onChange={(ev) => setEditMat((p) => {
                              const c = [...p];
                              c[idx] = { ...c[idx], loads: Number(ev.target.value || 0) };
                              return c;
                            })}
                          />
                        </label>

                        <button
                          className="btn btn-ghost materials-remove"
                          onClick={() => setEditMat((p) => p.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </button>
                      </div>

                      <label className="materials-notes" style={{ marginTop: 10 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Notes</div>
                        <textarea ref={(el) => { if (el) autoGrowTextarea(el); }} rows={1} className="input"
                          value={m.notes || ""}
                          onChange={(ev) => setEditMat((p) => {
                            const c = [...p];
                            c[idx] = { ...c[idx], notes: ev.target.value };
                            return c;
                          })} onInput={(e) => autoGrowTextarea(e.currentTarget)} onFocus={(e) => autoGrowTextarea(e.currentTarget)} style={{width: "100%", resize: "none", overflow: "hidden", boxSizing: "border-box"}}></textarea>
                      </label>
                    </div>
                  ))}
                </div>

                {/* Keep modules in the same order as the main timesheet: Info → Equipment → Materials → Slips */}
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>Slips</h3>
                    <label className="btn btn-primary" style={{ cursor: slipUploading ? "not-allowed" : "pointer", opacity: slipUploading ? 0.7 : 1 }}>
                      {slipUploading ? "Uploading…" : "+ Add Slip"}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        style={{ display: "none" }}
                        onChange={(e) => {
                          uploadSlips(e.target.files);
                          // reset so picking same file twice still triggers change
                          (e.target as any).value = "";
                        }}
                        disabled={slipUploading || !!editData.locked}
                      />
                    </label>
                  </div>
                  {slipErr && <div className="error" style={{ marginTop: 10 }}>{slipErr}</div>}
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    {editPhotos.length === 0 && <div className="subtle">No slips uploaded.</div>}
                    {editPhotos.map((p: Photo) => (
                      <div key={p.path} className="card" style={{ padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                          {p.filename || p.path}
                        </div>
                        <a className="btn btn-ghost" href={`/api/me/photo?path=${encodeURIComponent(p.path)}`} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      </div>
                    ))}
                  </div>
                </div>

                {editPhotos.length > 0 && (
                  <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>Photos</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginTop: 10 }}>
                      {editPhotos.map((p) => (
                        <a key={p.path} href={`/api/me/photo?path=${encodeURIComponent(p.path)}`} target="_blank" rel="noreferrer">
                          <img src={`/api/me/photo?path=${encodeURIComponent(p.path)}`} alt={p.filename} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 12, border: "1px solid #eee" }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}


                <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button className="btn btn-ghost" onClick={closeEdit}>Close</button>
                  <button className="btn btn-primary" onClick={saveEdit} disabled={!!editData.locked}>
                    {editData.locked ? "Locked" : "Save Changes"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}