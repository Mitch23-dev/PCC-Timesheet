import Head from "next/head";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import AdminTabs from "../../components/AdminTabs";
import ScrollableDropdown from "@/components/ScrollableDropdown";

type EmployeeRow = {
  id: number;
  name: string;
  pin: string;
  active: boolean;
  position: string | null;
  phone: string | null;
  created_at: string;
};

type NewEmployee = {
  name: string;
  pin: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  position: string;
  employment_type: string;
  hourly_rate: string;
  start_date: string;
  end_date: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  notes: string;
};


function safeGetLocalStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export default function AdminEmployeesListPage() {
  const router = useRouter();
  const [adminPw, setAdminPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);

  const [showAdd, setShowAdd] = useState(false);
  const [newEmp, setNewEmp] = useState<NewEmployee>({
    name: "",
    pin: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    province: "",
    postal_code: "",
    position: "",
    employment_type: "Hourly",
    hourly_rate: "",
    start_date: "",
    end_date: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    notes: "",
  });
useEffect(() => {
    const saved = typeof window !== "undefined" ? safeGetLocalStorage("pcc_admin_pw") : null;
    if (saved) {
      setAdminPw(saved);
    } else {
      router.replace("/admin/signin?returnTo=/admin/employees");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function signOut() {
    try {
      window.localStorage.removeItem("pcc_admin_pw");
    } catch {}
    router.replace("/admin/signin?returnTo=/admin/employees");
  }

  async function loadEmployees() {
    if (!adminPw) return;
    setLoading(true);
    setError(null);
    setStatus("Loading employees…");
    try {
      const r = await fetch("/api/admin/employees/list", {
        method: "GET",
        headers: { "x-admin-password": adminPw },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Failed to load employees (HTTP ${r.status})`);
      const rows = Array.isArray(data.employees) ? data.employees : [];
      // Keep the list view compact
      setEmployees(
        rows.map((e: any) => ({
          id: Number(e.id),
          name: String(e.name ?? ""),
          pin: String(e.pin ?? ""),
          active: Boolean(e.active),
          position: e.position ?? null,
          phone: e.phone ?? null,
          created_at: String(e.created_at ?? ""),
        }))
      );
      setStatus(null);
    } catch (e: any) {
      setStatus(null);
      setError(e?.message || "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (adminPw) loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPw]);

  const sortedEmployees = useMemo(() => {
    const copy = [...employees];
    // Active first, then name
    copy.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (a.name || "").localeCompare(b.name || "");
    });
    return copy;
  }, [employees]);

  async function createEmployee() {
    if (!adminPw) return;
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const fullName =
        newEmp.name.trim() || [newEmp.first_name.trim(), newEmp.last_name.trim()].filter(Boolean).join(" ").trim();

      const r = await fetch("/api/admin/employees/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPw },
        body: JSON.stringify({
          name: fullName,
          pin: newEmp.pin,
          first_name: newEmp.first_name,
          last_name: newEmp.last_name,
          email: newEmp.email,
          phone: newEmp.phone,
          address: newEmp.address,
          city: newEmp.city,
          province: newEmp.province,
          postal_code: newEmp.postal_code,
          position: newEmp.position,
          employment_type: newEmp.employment_type,
          hourly_rate: newEmp.hourly_rate ? Number(newEmp.hourly_rate) : null,
          start_date: newEmp.start_date || null,
          end_date: newEmp.end_date || null,
          emergency_contact_name: newEmp.emergency_contact_name,
          emergency_contact_phone: newEmp.emergency_contact_phone,
          notes: newEmp.notes,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 409 && data?.existing) {
          const ex = data.existing;
          setStatus(`Already exists: ${ex?.name || "Employee"} (PIN ${ex?.pin || ""}, active=${String(ex?.active)})`);
          await loadEmployees();
          setShowAdd(false);
          return;
        }
        throw new Error(data?.error || `Create failed (HTTP ${r.status})`);
      }
      setNewEmp({
        name: "",
        pin: "",
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        province: "",
        postal_code: "",
        position: "",
        employment_type: "Hourly",
        hourly_rate: "",
        start_date: "",
        end_date: "",
        emergency_contact_name: "",
        emergency_contact_phone: "",
        notes: "",
      });
setShowAdd(false);
      await loadEmployees();
    } catch (e: any) {
      setError(e?.message || "Create employee failed.");
    } finally {
      setLoading(false);
    }
  }

  async function setActive(empId: number, active: boolean) {
    if (!adminPw) return;
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const r = await fetch("/api/admin/employees/set_active", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPw },
        body: JSON.stringify({ id: empId, active }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Update failed (HTTP ${r.status})`);
      await loadEmployees();
    } catch (e: any) {
      setError(e?.message || "Update failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>PCC Timesheet Admin — Employees</title>
      </Head>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
        <div className="tabcard">
          <AdminTabs active="employees" />
          <div className="card tabcard-body" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0 }}>Employees</h1>
            <div style={{ opacity: 0.8, marginTop: 4 }}>Click an employee to view / edit full details.</div>
          </div>

          <div className="admin-action-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => loadEmployees()} disabled={loading} className="btn btn-ghost btn-compact">
              Refresh
            </button>
            <button onClick={() => setShowAdd((v) => !v)} className="btn btn-primary btn-compact">
              {showAdd ? "Close" : "Add Employee"}
            </button>
            <button onClick={signOut} className="btn btn-ghost btn-compact">
              Sign out
            </button>
          </div>
        </div>

        {error ? (
          <div style={{ background: "#ffe8e8", border: "1px solid #ffb3b3", padding: 12, marginTop: 12, borderRadius: 8 }}>
            {error}
          </div>
        ) : null}
        {status ? <div style={{ marginTop: 12, opacity: 0.85 }}>{status}</div> : null}

        {showAdd ? (
          <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>New Employee</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 220px", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>First Name</div>
                <input
                  value={newEmp.first_name}
                  onChange={(e) => setNewEmp((p) => ({ ...p, first_name: e.target.value }))}
                  placeholder="First"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Last Name</div>
                <input
                  value={newEmp.last_name}
                  onChange={(e) => setNewEmp((p) => ({ ...p, last_name: e.target.value }))}
                  placeholder="Last"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>PIN (4 digits)</div>
                <input
                  value={newEmp.pin}
                  onChange={(e) => setNewEmp((p) => ({ ...p, pin: e.target.value }))}
                  placeholder="2026"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>

              <div style={{ gridColumn: "1 / span 2" }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Display Name (optional)</div>
                <input
                  value={newEmp.name}
                  onChange={(e) => setNewEmp((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Leave blank to auto-use First + Last"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Position</div>
                <input
                  value={newEmp.position}
                  onChange={(e) => setNewEmp((p) => ({ ...p, position: e.target.value }))}
                  placeholder="Foreman / Operator / Labourer"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Email</div>
                <input
                  value={newEmp.email}
                  onChange={(e) => setNewEmp((p) => ({ ...p, email: e.target.value }))}
                  placeholder="name@company.com"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Phone</div>
                <input
                  value={newEmp.phone}
                  onChange={(e) => setNewEmp((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="(902) 555-1234"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Employment Type</div>
                <ScrollableDropdown
                  value={newEmp.employment_type}
                  options={["Hourly", "Salary", "Contract"]}
                  onChange={(next) => setNewEmp((p) => ({ ...p, employment_type: next }))}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Hourly Rate</div>
                <input
                  value={newEmp.hourly_rate}
                  onChange={(e) => setNewEmp((p) => ({ ...p, hourly_rate: e.target.value }))}
                  placeholder="28.00"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Start Date</div>
                <input
                  type="date"
                  value={newEmp.start_date}
                  onChange={(e) => setNewEmp((p) => ({ ...p, start_date: e.target.value }))}
                  style={{ width: "100%", padding: 10 }}
                />
              </div>

              <div style={{ gridColumn: "1 / span 3", marginTop: 6, fontWeight: 800, opacity: 0.85 }}>
                Address (optional)
              </div>
              <div style={{ gridColumn: "1 / span 2" }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Street Address</div>
                <input
                  value={newEmp.address}
                  onChange={(e) => setNewEmp((p) => ({ ...p, address: e.target.value }))}
                  placeholder="123 Main St"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>City</div>
                <input
                  value={newEmp.city}
                  onChange={(e) => setNewEmp((p) => ({ ...p, city: e.target.value }))}
                  placeholder="Dartmouth"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Province</div>
                <input
                  value={newEmp.province}
                  onChange={(e) => setNewEmp((p) => ({ ...p, province: e.target.value }))}
                  placeholder="NS"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Postal Code</div>
                <input
                  value={newEmp.postal_code}
                  onChange={(e) => setNewEmp((p) => ({ ...p, postal_code: e.target.value }))}
                  placeholder="B3B 1C5"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>

              <div style={{ gridColumn: "1 / span 3", marginTop: 6, fontWeight: 800, opacity: 0.85 }}>
                Emergency Contact (optional)
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Name</div>
                <input
                  value={newEmp.emergency_contact_name}
                  onChange={(e) => setNewEmp((p) => ({ ...p, emergency_contact_name: e.target.value }))}
                  placeholder="Contact name"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Phone</div>
                <input
                  value={newEmp.emergency_contact_phone}
                  onChange={(e) => setNewEmp((p) => ({ ...p, emergency_contact_phone: e.target.value }))}
                  placeholder="(902) 555-1234"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>End Date (optional)</div>
                <input
                  type="date"
                  value={newEmp.end_date}
                  onChange={(e) => setNewEmp((p) => ({ ...p, end_date: e.target.value }))}
                  style={{ width: "100%", padding: 10 }}
                />
              </div>

              <div style={{ gridColumn: "1 / span 3" }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Notes</div>
                <textarea
                  value={newEmp.notes}
                  onChange={(e) => setNewEmp((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Anything helpful for payroll / HR (optional)"
                  style={{ width: "100%", padding: 10, minHeight: 80 }}
                />
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button onClick={createEmployee} disabled={loading} className="btn btn-primary">
                Create Employee
              </button>
              <button onClick={() => setShowAdd(false)} disabled={loading} className="btn btn-ghost">
                Cancel
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
              Tip: You can always edit/complete info later by clicking the employee row.
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #ddd" }}>Name</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #ddd" }}>Position</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #ddd" }}>Phone</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #ddd" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedEmployees.map((emp) => (
                <tr
                  key={emp.id}
                  onClick={() => router.push(`/admin/employees/${emp.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{emp.name}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{emp.position || "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{emp.phone || "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{emp.active ? "Active" : "Inactive"}</td>
                </tr>
              ))}
              {sortedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 12, opacity: 0.75 }}>
                    No employees found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
          </div>
        </div>
      </div>
    </>
  );
}
