import { useEffect, useMemo, useState } from "react";
import Head from "next/head";

type TimesheetRow = {
  id: string;
  created_at?: string | null;
  work_date: string; // YYYY-MM-DD
  week_start?: string | null;
  worker_name: string;
  type?: string | null;
  job_text_raw?: string | null;
  job_text_clean?: string | null;
  hours?: number | null;
  minutes?: number | null;
  payclass?: string | null;
  equipment?: string | null;
  notes?: string | null;
  slip_paths?: string[] | null;
};

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

export default function AdminPage() {
  const [adminPw, setAdminPw] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState(firstDayOfThisWeekISOThursday());
  const [dateTo, setDateTo] = useState(todayISO());

  const [employee, setEmployee] = useState("All");
  const [employeeNames, setEmployeeNames] = useState<string[]>([]);

  const [rows, setRows] = useState<TimesheetRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("pcc_admin_pw") : null;
    if (saved) setAdminPw(saved);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && adminPw) {
      window.localStorage.setItem("pcc_admin_pw", adminPw);
    }
  }, [adminPw]);

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
    const emp = employee;
    if (emp === "All") return rows;
    return rows.filter((r) => r.worker_name === emp);
  }, [rows, employee]);

  return (
    <>
      <Head>
        <title>PCC Timesheet — Admin</title>
      </Head>

      <main style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }}>
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h1 style={{ margin: 0 }}>Admin</h1>
              <div className="muted">Timesheets overview + payroll export prep</div>
            </div>
          </div>

          <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <div style={{ minWidth: 220 }}>
              <div className="label">Admin Password</div>
              <input
                className="input"
                value={adminPw}
                onChange={(e) => setAdminPw(e.target.value)}
                placeholder="Enter admin password"
                type="password"
              />
            </div>

            <div>
              <div className="label">Date From</div>
              <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>

            <div>
              <div className="label">Date To</div>
              <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>

            <div style={{ minWidth: 220 }}>
              <div className="label">Employee Filter</div>
              <select className="input" value={employee} onChange={(e) => setEmployee(e.target.value)}>
                <option value="All">All Employees</option>
                {employeeNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                This is just a filter. Employees are maintained in the Employees tab/page.
              </div>
            </div>

            <div className="row" style={{ alignItems: "flex-end", gap: 10 }}>
              <button className="btn" onClick={loadEmployees} disabled={!adminPw || loading}>
                Refresh Employees
              </button>
              <button className="btn primary" onClick={loadTimesheets} disabled={!adminPw || loading}>
                {loading ? "Loading…" : "Load Timesheets"}
              </button>
            </div>
          </div>

          {status && <div className="muted" style={{ marginTop: 10 }}>{status}</div>}
          {err && <div className="bad" style={{ marginTop: 10 }}>{err}</div>}
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
                  <th>Pay Class</th>
                  <th>Equipment</th>
                  <th>Notes</th>
                  <th>Slips</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const mins = (r.minutes || 0) / 60;
                  const totalHrs = (r.hours || 0) + mins;
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
                      <td>{r.payclass || ""}</td>
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
      </main>
    </>
  );
}
