import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import AdminTabs from "../components/AdminTabs";
import ScrollableDropdown from "@/components/ScrollableDropdown";
import { JOB_TYPES } from "@/lib/constants";

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




type TimesheetRow = {
  id: string;
  created_at?: string | null;
  work_date: string; // YYYY-MM-DD
  week_start?: string | null;
  worker_name: string;
  type?: string | null;
  job_text_raw?: string | null;
  job_text_clean?: string | null;
  // Newer schema: a single numeric total_hours field.
  total_hours?: number | null;
  // Older schema compatibility (kept so older DB rows don’t break UI)
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

const EQUIPMENT_OPTIONS = [
  "Komatsu 138",
  "Komatsu 210",
  "Komatsu 240",
  "Kubota Mini",
  "John Deere Skid Steer",
  "Kubota Skid Steer",
  "Dump Truck",
  "Roller",
  "Plate Tamper",
  "Other",
];

const ATTACHMENT_OPTIONS = ["None", "Bucket", "Rock Breaker", "Grapple", "Forks", "Other"];

const MATERIAL_OPTIONS = [
  'Conrads - 3/4" Clear Stone',
  'Conrads - 3/4" Crusher Run',
  'Conrads - 2" Clear Stone',
  'Conrads - 2" Crusher Run',
  "Conrads - Type 1 Gravel",
  "Conrads - Type 2 Gravel",
  "Conrads - Type 3 Gravel",
  "Conrads - Sand",
  "Topsoil",
  "Asphalt",
  "Concrete",
  "Other",
];


function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function firstDayOfThisWeekISOThursday() {
  // Weeks run Thu→Wed. Find the most recent Thursday (including today).
  const d = new Date();
  const day = d.getDay(); // Sun=0..Sat=6
  // Thu=4
  const delta = (day - 4 + 7) % 7;
  d.setDate(d.getDate() - delta);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function jobSummaryOf(r: TimesheetRow): string {
  const raw = String(r.job_text_clean || r.job_text_raw || "");
  const first = raw.split(/\r?\n/)[0].trim();
  return first || "(blank)";
}

export default function AdminPage() {
  const router = useRouter();
  const [adminPw, setAdminPw] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Default to blank so Admin can load *all* time entries without clearing filters.
  // (Blank values mean no date filtering on the API.)
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [employee, setEmployee] = useState("All");
  const [employeeNames, setEmployeeNames] = useState<string[]>([]);

  const [jobSummary, setJobSummary] = useState("All");

  const [rows, setRows] = useState<TimesheetRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Edit modal state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editTimesheet, setEditTimesheet] = useState<any>(null);
  const [editEquip, setEditEquip] = useState<EquipmentEditRow[]>([]);
  const [editMat, setEditMat] = useState<MaterialEditRow[]>([]);
  const [editPhotos, setEditPhotos] = useState<{ id?: string; path: string; filename?: string | null }[]>([]);
  const [uploadingSlips, setUploadingSlips] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("pcc_admin_pw") : null;
    if (saved) setAdminPw(saved);
    // If not signed in, push to the single admin sign-in page.
    if (!saved) {
      router.replace("/admin/signin?returnTo=/admin");
    }
  }, []);

  // NOTE: We store admin auth once on /admin/signin. We do not prompt for it here.

  async function loadEmployees() {
    setErr(null);
    setStatus("Loading employees…");
    try {
      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPw },
        body: JSON.stringify({}),
      });
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
    try {
      window.localStorage.removeItem("pcc_admin_pw");
    } catch {}
    router.replace("/admin/signin?returnTo=/admin");
  }

  function clearDates() {
    // Truly clear the date range filters (blank = no date filtering)
    setDateFrom("");
    setDateTo("");
  }

  async function openEdit(id: string) {
    if (!adminPw) return;
    setErr(null);
    setStatus(null);
    setEditingId(id);
    setEditLoading(true);
    setEditTimesheet(null);
    setEditEquip([]);
    setEditMat([]);
    setEditPhotos([]);
    try {
      const r = await fetch(`/api/admin/get-entry?id=${encodeURIComponent(id)}`, {
        headers: { "x-admin-password": adminPw },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Failed to load entry (HTTP ${r.status})`);

      const ts = j?.timesheet || {};
      const equip = Array.isArray(j?.equipment) ? j.equipment : [];
      const mats = Array.isArray(j?.materials) ? j.materials : [];
      const photos = Array.isArray(j?.photos) ? j.photos : [];

      setEditTimesheet({
        worker_name: String(ts.worker_name || ""),
        work_date: String(ts.work_date || ""),
        job_type: String(ts.job_type || "Civil"),
        job_text_clean: String(ts.job_text_clean || ts.job_text_raw || ""),
        total_hours: typeof ts.total_hours === "number" ? ts.total_hours : Number(ts.total_hours || 0),
        notes: ts.notes ?? "",
      });

      setEditEquip(
        equip.map((e: any) => ({
          equipment: String(e.equipment || ""),
          attachment: e.attachment ?? null,
          hours: e.hours ?? null,
          notes: e.notes ?? null,
          trucking_hours: e.trucking_hours ?? null,
          trucking_notes: e.trucking_notes ?? null,
        }))
      );

      setEditMat(
        mats.map((m: any) => ({
          material: String(m.material || ""),
          loads: Number(m.loads || 0),
          notes: m.notes ?? null,
        }))
      );

      setEditPhotos(
        photos.map((p: any) => ({
          id: p.id,
          path: String(p.path || ""),
          filename: p.filename ?? null,
        })).filter((p: any) => p.path)
      );
    } catch (e: any) {
      setErr(String(e?.message || e));
      setEditingId(null);
    } finally {
      setEditLoading(false);
    }
  }

  function closeEdit() {
    setEditingId(null);
    setEditTimesheet(null);
    setEditEquip([]);
    setEditMat([]);
    setEditPhotos([]);
  }

  async function uploadSlips(files: FileList | null) {
    if (!files || !files.length || !editingId) return;
    if (!adminPw) return;
    setErr(null);
    setUploadingSlips(true);
    try {
      const fd = new FormData();
      fd.append("timesheetId", editingId);
      Array.from(files).forEach((f) => fd.append("slips", f));

      const res = await fetch("/api/admin/upload-slip", {
        method: "POST",
        headers: { "x-admin-password": adminPw },
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `Upload failed (HTTP ${res.status})`);

      // Refresh photos list by reloading the entry
      await openEdit(editingId);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setUploadingSlips(false);
    }
  }

  function addEquip() {
    setEditEquip((p) => [
      ...p,
      {
        equipment: "Komatsu 138",
        attachment: "None",
        hours: null,
        notes: null,
        trucking_hours: null,
        trucking_notes: null,
      },
    ]);
  }

  function addMat() {
    setEditMat((p) => [...p, { material: 'Conrads - 3/4" Clear Stone', loads: 0, notes: null }]);
  }

  async function saveEdit() {
    if (!editingId || !editTimesheet) return;
    setErr(null);
    setStatus("Saving…");
    try {
      const payload = {
        id: editingId,
        patch: {
          worker_name: editTimesheet.worker_name,
          work_date: editTimesheet.work_date,
          job_type: editTimesheet.job_type,
          job_text_clean: editTimesheet.job_text_clean,
          total_hours: Number(editTimesheet.total_hours),
          notes: editTimesheet.notes ?? null,
        },
        equipment: editEquip.map((e) => {
          const isDump = e.equipment === "Dump Truck";
          return {
            equipment: e.equipment,
            attachment: e.attachment || null,
            hours: isDump ? null : e.hours ?? null,
            notes: isDump ? null : e.notes ?? null,
            trucking_hours: isDump ? e.trucking_hours ?? null : null,
            trucking_notes: isDump ? e.trucking_notes ?? null : null,
          };
        }),
        materials: editMat
          .map((m) => ({ material: m.material, loads: Number(m.loads || 0), notes: m.notes ?? null }))
          .filter((m) => !Number.isNaN(m.loads)),
      };

      const r = await fetch("/api/admin/update-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPw },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Failed to save (HTTP ${r.status})`);
      closeEdit();
      setStatus("Saved.");
      await loadTimesheets();
    } catch (e: any) {
      setStatus(null);
      setErr(String(e?.message || e));
    }
  }

  async function uploadEditSlips(fileList: FileList | null) {
    if (!editingId || !adminPw) return;
    if (!fileList || fileList.length === 0) return;
    setErr(null);
    setUploadingSlips(true);
    try {
      const fd = new FormData();
      fd.append("timesheetId", editingId);
      Array.from(fileList).forEach((f) => fd.append("slips", f));

      const r = await fetch("/api/admin/upload-slip", {
        method: "POST",
        headers: { "x-admin-password": adminPw },
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Upload failed (HTTP ${r.status})`);

      // Re-load the entry so the slip list refreshes in the modal.
      await openEdit(editingId);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setUploadingSlips(false);
    }
  }

  async function deleteEntry(id: string) {
    if (!adminPw) return;
    const ok = confirm("Delete this timesheet entry? This cannot be undone.");
    if (!ok) return;
    setErr(null);
    setStatus("Deleting…");
    try {
      const r = await fetch("/api/admin/delete-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPw },
        body: JSON.stringify({ id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Delete failed (HTTP ${r.status})`);
      setStatus("Deleted.");
      await loadTimesheets();
    } catch (e: any) {
      setStatus(null);
      setErr(String(e?.message || e));
    }
  }

  async function exportPayrollCSV() {
    if (!adminPw) return;
    setErr(null);
    setStatus("Preparing payroll CSV…");
    try {
      const url = `/api/admin/payroll-export?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(
        dateTo
      )}`;
      const r = await fetch(url, { headers: { "x-admin-password": adminPw } });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `Export failed (HTTP ${r.status})`);
      }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `payroll_${dateFrom}_to_${dateTo}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus("Payroll CSV downloaded.");
    } catch (e: any) {
      setStatus(null);
      setErr(String(e?.message || e));
    }
  }

  async function exportBatchPDF() {
    if (!adminPw) return;
    setErr(null);
    setStatus("Preparing batch PDF…");
    try {
      const url = `/api/admin/pdf-batch?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&employee=${encodeURIComponent(employee)}`;
      const r = await fetch(url, { headers: { "x-admin-password": adminPw } });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `PDF export failed (HTTP ${r.status})`);
      }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `timesheets_${dateFrom}_to_${dateTo}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus("Batch PDF downloaded.");
    } catch (e: any) {
      setStatus(null);
      setErr(String(e?.message || e));
    }
  }

  async function downloadEntryPDF(id: string, workDate: string, worker: string) {
    if (!adminPw) return;
    setErr(null);
    setStatus("Preparing PDF…");
    try {
      const url = `/api/admin/pdf-entry?id=${encodeURIComponent(id)}`;
      const r = await fetch(url, { headers: { "x-admin-password": adminPw } });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `PDF failed (HTTP ${r.status})`);
      }
      const blob = await r.blob();
      const safeWorker = (worker || "employee").replace(/[^a-zA-Z0-9 _.-]/g, "_");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `timesheet_${workDate}_${safeWorker}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus("PDF downloaded.");
    } catch (e: any) {
      setStatus(null);
      setErr(String(e?.message || e));
    }
  }

  async function setLockRange(locked: boolean) {
    if (!adminPw) return;
    setErr(null);
    setStatus(locked ? "Locking entries in range…" : "Unlocking entries in range…");
    try {
      const r = await fetch("/api/admin/lock-range", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPw },
        body: JSON.stringify({ dateFrom, dateTo, locked }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `Failed (HTTP ${r.status})`);
      setStatus(locked ? "Range locked." : "Range unlocked.");
      await loadTimesheets();
    } catch (e: any) {
      setStatus(null);
      setErr(String(e?.message || e));
    }
  }

  async function loadTimesheets() {
    setErr(null);
    setStatus(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/list", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPw },
        body: JSON.stringify({ dateFrom, dateTo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const got: TimesheetRow[] = Array.isArray(data?.rows) ? data.rows : [];
      setRows(got);
      setStatus(`Loaded ${got.length} entries.`);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Autoload employees list once we have a password (or after refresh).
    if (adminPw) loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPw]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (employee !== "All" && r.worker_name !== employee) return false;
      if (jobSummary !== "All" && jobSummaryOf(r) !== jobSummary) return false;
      return true;
    });
  }, [rows, employee, jobSummary]);

  const jobSummaries = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(jobSummaryOf(r));
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const totalsByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredRows) {
      // Prefer total_hours if present (current DB schema). Fall back to hours/minutes.
      const totalHrs =
        typeof r.total_hours === "number"
          ? r.total_hours
          : (r.hours || 0) + ((r.minutes || 0) / 60);
      const key = r.worker_name || "";
      map.set(key, (map.get(key) || 0) + (Number.isFinite(totalHrs) ? totalHrs : 0));
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredRows]);

  const grandTotal = useMemo(() => totalsByEmployee.reduce((sum, [, h]) => sum + h, 0), [totalsByEmployee]);

  return (
    <>
      <Head>
        <title>PCC Timesheet — Admin</title>
      </Head>

      <main style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }}>
        <div className="tabcard">
          <AdminTabs active="timesheets" />
          <div className="card tabcard-body" style={{ padding: 16, marginBottom: 14 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h1 style={{ margin: 0 }}>Admin</h1>
                <div className="muted">Timesheets overview + payroll export prep</div>
              </div>
              <button className="btn btn-primary" onClick={signOut}>
                Sign out
              </button>
            </div>

            {/* Filters */}
            <div className="adminFilters" style={{ marginTop: 12 }}>
              <div className="field">
                <div className="label">Date From</div>
                <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="field">
                <div className="label">Date To</div>
                <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div className="adminFiltersBtn">
                <button className="btn btn-primary" onClick={clearDates} disabled={loading}>
                  Clear Dates
                </button>
              </div>

              <div className="field">
                <div className="label">Employee Filter</div>
                <ScrollableDropdown
                  value={employee}
                  options={[{ value: "All", label: "All Employees" }, ...employeeNames]}
                  onChange={(next) => setEmployee(next)}
                />
              </div>

              <div className="field">
                <div className="label">Job Summary Filter</div>
                <ScrollableDropdown
                  value={jobSummary}
                  options={[{ value: "All", label: "All Jobs" }, ...jobSummaries]}
                  onChange={(next) => setJobSummary(next)}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="adminActions">
              <button className="btn primary" onClick={loadTimesheets} disabled={!adminPw || loading}>
                {loading ? "Loading…" : "Load Timesheets"}
              </button>
              <button className="btn btn-primary" onClick={exportBatchPDF} disabled={!adminPw || loading}>
                Export Batch PDF
              </button>
              <button className="btn btn-primary" onClick={() => setLockRange(true)} disabled={!adminPw || loading}>
                Lock Range
              </button>
              <button className="btn btn-primary" onClick={() => setLockRange(false)} disabled={!adminPw || loading}>
                Unlock Range
              </button>
              <button className="btn btn-primary" onClick={loadEmployees} disabled={!adminPw || loading}>
                Refresh Employees
              </button>
            </div>

          {status && <div className="muted" style={{ marginTop: 10 }}>{status}</div>}
          {err && <div className="bad" style={{ marginTop: 10 }}>{err}</div>}
        </div>

        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Totals</h2>
            <div className="muted">Grand total: {grandTotal.toFixed(2)} hrs</div>
          </div>
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th style={{ textAlign: "right" }}>Hours</th>
                </tr>
              </thead>
              <tbody>
                {totalsByEmployee.map(([name, hrs]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td style={{ textAlign: "right" }}>{hrs.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>Entries</h2>
            <div className="muted">{filteredRows.length} shown</div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Type</th>
                  <th>Job</th>
                  <th style={{ textAlign: "right" }}>Hours</th>
                  <th>Equipment</th>
                  <th>Notes</th>
                  <th>Slips</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const totalHrs =
                    typeof r.total_hours === "number"
                      ? r.total_hours
                      : (r.hours || 0) + ((r.minutes || 0) / 60);
                  const slips = Array.isArray(r.slip_paths) ? r.slip_paths : [];
                  return (
                    <tr key={r.id}>
                      <td>{r.work_date}</td>
                      <td>{r.worker_name}</td>
                      <td>{r.type || ""}</td>
                      <td style={{ maxWidth: 360 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {String(r.job_text_clean || r.job_text_raw || "").split(/\r?\n/)[0]}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>{Number.isFinite(totalHrs) ? totalHrs.toFixed(2) : ""}</td>
                      <td>{r.equipment || ""}</td>
                      <td style={{ maxWidth: 280 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.notes || ""}
                        </div>
                      </td>
                      <td>
                        {slips.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {slips.map((p, i) => (
                              <a
                                key={`${r.id}-${i}`}
                                href={`/admin/slip?path=${encodeURIComponent(p)}&employee=${encodeURIComponent(
                                  r.worker_name || ""
                                )}&job=${encodeURIComponent(String(r.job_text_clean || r.job_text_raw || ""))}&date=${encodeURIComponent(
                                  r.work_date || ""
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Slip {i + 1}
                              </a>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            className="btn btn-primary"
                            style={{ padding: "6px 10px" }}
                            onClick={() => downloadEntryPDF(r.id, r.work_date, r.worker_name)}
                          >
                            PDF
                          </button>
                          <button
                            className="btn btn-primary"
                            style={{ padding: "6px 10px" }}
                            onClick={() => openEdit(r.id)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-primary"
                            style={{ padding: "6px 10px" }}
                            onClick={() => deleteEntry(r.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            Tip: keep Date From / Date To aligned with your Thu→Wed payroll weeks.
          </div>
        </div>

        {editingId && (
          <div className="modal-backdrop" onClick={closeEdit}>
            <div className="modal admin-edit-modal" onClick={(e) => e.stopPropagation()}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>Edit Timesheet</div>
                  <div className="muted" style={{ fontSize: 12 }}>Admin edit (affects PDFs + exports)</div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-primary" onClick={closeEdit}>Close</button>
                  <button className="btn primary" onClick={saveEdit} disabled={editLoading || !editTimesheet}>Save</button>
                </div>
              </div>

              {editLoading && <div className="muted" style={{ marginTop: 12 }}>Loading…</div>}
              {!editLoading && editTimesheet && (
                <div style={{ marginTop: 12 }}>
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

                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 900 }}>Equipment</div>
                      <button className="btn btn-primary" onClick={addEquip}>+ Add Equipment</button>
                    </div>
                    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                      {editEquip.map((e, idx) => {
                        const isDump = e.equipment === "Dump Truck";
                        return (
                          <div key={idx} style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 10 }}>
                            <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                              <div style={{ minWidth: 220 }}>
                                <div className="label">Equipment</div>
                                <ScrollableDropdown
                                  value={e.equipment}
                                  options={EQUIPMENT_OPTIONS}
                                  onChange={(next) =>
                                    setEditEquip((p) => p.map((x, i) => (i === idx ? { ...x, equipment: next } : x)))
                                  }
                                />
                              </div>

                              {!isDump && (
                                <div style={{ minWidth: 200 }}>
                                  <div className="label">Attachment</div>
                                  <ScrollableDropdown
                                    value={e.attachment || "None"}
                                    options={ATTACHMENT_OPTIONS}
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

                              <button className="btn btn-primary" onClick={() => setEditEquip((p) => p.filter((_, i) => i !== idx))}>Remove</button>
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
                  </div>

                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 900 }}>Materials</div>
                      <button className="btn btn-primary" onClick={addMat}>+ Add Material</button>
                    </div>
                    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                      {editMat.map((m, idx) => (
                        <div key={idx} style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 10 }}>
                          <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                            <div style={{ minWidth: 260 }}>
                              <div className="label">Material</div>
                              <ScrollableDropdown
                                value={m.material}
                                options={MATERIAL_OPTIONS}
                                onChange={(next) =>
                                  setEditMat((p) => p.map((x, i) => (i === idx ? { ...x, material: next } : x)))
                                }
                              />
                            </div>
                            <div>
                              <div className="label">Loads</div>
                              <input className="input" inputMode="decimal" value={m.loads ?? 0} onChange={(ev) => setEditMat((p) => p.map((x, i) => i === idx ? ({ ...x, loads: Number(ev.target.value) }) : x))} />
                            </div>
                            <button className="btn btn-primary" onClick={() => setEditMat((p) => p.filter((_, i) => i !== idx))}>Remove</button>
                          </div>
                          <div style={{ marginTop: 8 }}>
                            <div className="label">Notes</div>
                            <textarea ref={(el) => { if (el) autoGrowTextarea(el); }} rows={1} className="input" value={m.notes || ""} onChange={(ev) => setEditMat((p) => p.map((x, i) => i === idx ? ({ ...x, notes: ev.target.value }) : x))} onInput={(e) => autoGrowTextarea(e.currentTarget)} onFocus={(e) => autoGrowTextarea(e.currentTarget)} style={{width: "100%", resize: "none", overflow: "hidden", boxSizing: "border-box"}}></textarea>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Keep modules in the same order as the main timesheet: Info → Equipment → Materials → Slips */}
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 900 }}>Slips</div>
                      <label className="btn btn-primary" style={{ padding: "6px 10px" }}>
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
                      </label>
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
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </main>
    </>
  );
}