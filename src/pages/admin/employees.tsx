import React, { useEffect, useMemo, useState } from "react";

type EmployeeRow = {
  id: number;
  name: string;
  pin: string;
  active: boolean;
  phone: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  created_at: string;
};

function safeGetLocalStorage(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeSetLocalStorage(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch {}
}

export default function AdminEmployeesPage() {
  const [authed, setAuthed] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [employees, setEmployees] = useState<EmployeeRow[]>([]);

  // New employee form
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpPin, setNewEmpPin] = useState("");
  const [newEmpPhone, setNewEmpPhone] = useState("");
  const [newEmpAddress, setNewEmpAddress] = useState("");
  const [newEmpCity, setNewEmpCity] = useState("");
  const [newEmpProvince, setNewEmpProvince] = useState("");
  const [newEmpPostal, setNewEmpPostal] = useState("");
  const [newEmpEmergName, setNewEmpEmergName] = useState("");
  const [newEmpEmergPhone, setNewEmpEmergPhone] = useState("");
  const [newEmpNotes, setNewEmpNotes] = useState("");

  // Edit modal
  const [editEmp, setEditEmp] = useState<EmployeeRow | null>(null);
  const [editEmpName, setEditEmpName] = useState("");
  const [editEmpPin, setEditEmpPin] = useState("");
  const [editEmpPhone, setEditEmpPhone] = useState("");
  const [editEmpAddress, setEditEmpAddress] = useState("");
  const [editEmpCity, setEditEmpCity] = useState("");
  const [editEmpProvince, setEditEmpProvince] = useState("");
  const [editEmpPostal, setEditEmpPostal] = useState("");
  const [editEmpEmergName, setEditEmpEmergName] = useState("");
  const [editEmpEmergPhone, setEditEmpEmergPhone] = useState("");
  const [editEmpNotes, setEditEmpNotes] = useState("");

  // Test pin
  const [testPin, setTestPin] = useState("");
  const [testPinResult, setTestPinResult] = useState<string | null>(null);

  useEffect(() => {
    const token = safeGetLocalStorage("pcc_admin_authed");
    if (token === "1") setAuthed(true);
  }, []);

  async function loadEmployees() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/employees/list", { method: "GET" });
      if (!r.ok) throw new Error(`Failed to load employees (HTTP ${r.status})`);
      const data = await r.json();
      setEmployees(Array.isArray(data.employees) ? data.employees : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authed) loadEmployees();
  }, [authed]);

  async function adminSignin() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || `Sign-in failed (HTTP ${r.status})`);
      safeSetLocalStorage("pcc_admin_authed", "1");
      setAuthed(true);
    } catch (e: any) {
      setError(e?.message || "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function createEmployee() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/employees/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newEmpName,
          pin: newEmpPin,
          phone: newEmpPhone,
          address: newEmpAddress,
          city: newEmpCity,
          province: newEmpProvince,
          postal_code: newEmpPostal,
          emergency_contact_name: newEmpEmergName,
          emergency_contact_phone: newEmpEmergPhone,
          notes: newEmpNotes,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || `Create failed (HTTP ${r.status})`);
      setNewEmpName(""); setNewEmpPin("");
      setNewEmpPhone(""); setNewEmpAddress(""); setNewEmpCity(""); setNewEmpProvince(""); setNewEmpPostal("");
      setNewEmpEmergName(""); setNewEmpEmergPhone(""); setNewEmpNotes("");
      await loadEmployees();
    } catch (e: any) {
      setError(e?.message || "Create employee failed.");
    } finally {
      setLoading(false);
    }
  }

  async function setActive(emp: EmployeeRow, active: boolean) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/employees/set_active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: emp.id, active }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || `Update failed (HTTP ${r.status})`);
      await loadEmployees();
    } catch (e: any) {
      setError(e?.message || "Update failed.");
    } finally {
      setLoading(false);
    }
  }

  function openEdit(emp: EmployeeRow) {
    setEditEmp(emp);
    setEditEmpName(emp.name);
    setEditEmpPin(emp.pin);
    setEditEmpPhone(emp.phone || "");
    setEditEmpAddress(emp.address || "");
    setEditEmpCity(emp.city || "");
    setEditEmpProvince(emp.province || "");
    setEditEmpPostal(emp.postal_code || "");
    setEditEmpEmergName(emp.emergency_contact_name || "");
    setEditEmpEmergPhone(emp.emergency_contact_phone || "");
    setEditEmpNotes(emp.notes || "");
  }

  async function saveEdit() {
    if (!editEmp) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/employees/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editEmp.id,
          name: editEmpName,
          pin: editEmpPin,
          phone: editEmpPhone,
          address: editEmpAddress,
          city: editEmpCity,
          province: editEmpProvince,
          postal_code: editEmpPostal,
          emergency_contact_name: editEmpEmergName,
          emergency_contact_phone: editEmpEmergPhone,
          notes: editEmpNotes,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || `Save failed (HTTP ${r.status})`);
      setEditEmp(null);
      await loadEmployees();
    } catch (e: any) {
      setError(e?.message || "Save failed.");
    } finally {
      setLoading(false);
    }
  }

  async function runTestPin() {
    setTestPinResult(null);
    try {
      const r = await fetch(`/api/admin/employees/test_pin?pin=${encodeURIComponent(testPin.trim())}`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Test failed (HTTP ${r.status})`);
      setTestPinResult(`OK: ${data.employee?.name || "Employee found"} (active=${String(data.employee?.active)})`);
    } catch (e: any) {
      setTestPinResult(e?.message || "Test failed");
    }
  }

  const sorted = useMemo(() => {
    return [...employees].sort((a,b) => (a.name || "").localeCompare(b.name || ""));
  }, [employees]);

  if (!authed) {
    return (
      <div className="container">
        <div className="pccBannerWrap">
          <img className="pccBanner" src="/pcc-banner.png" alt="Peter Conrod Construction Ltd" />
          <div className="pccAccentLine" />
        </div>

        <h1 className="h1" style={{ marginTop: 18 }}>Admin Sign In</h1>
        <p className="subtle">Enter the admin password to manage employees.</p>
        <div className="card" style={{ padding: 14, maxWidth: 520 }}>
          <label>
            Password
            <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="primary" onClick={adminSignin} disabled={loading}>Sign In</button>
          </div>
          {error && <p style={{ marginTop: 10, color: "salmon" }}>{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="pccBannerWrap">
        <img className="pccBanner" src="/pcc-banner.png" alt="Peter Conrod Construction Ltd" />
        <div className="pccAccentLine" />
      </div>

      <h1 className="h1" style={{ marginTop: 18 }}>Admin</h1>
      <div style={{ display: "flex", gap: 8, margin: "10px 0 18px", flexWrap: "wrap" }}>
        <a href="/admin" className="pill-link">Timesheets</a>
        <a href="/admin/employees" className="pill-link pill-link-active">Employees</a>
      </div>

      {error && <p style={{ marginTop: 0, color: "salmon" }}>{error}</p>}

      <h2 className="h2" style={{ marginTop: 0 }}>Employees</h2>
      <div className="card" style={{ padding: 14 }}>
        <div className="ts-grid">
          <label>
            Name
            <input value={newEmpName} onChange={(e) => setNewEmpName(e.target.value)} placeholder="Employee name" />
          </label>
          <label>
            PIN (4 digits)
            <input value={newEmpPin} onChange={(e) => setNewEmpPin(e.target.value)} placeholder="1234" />
          </label>
        </div>

        <div className="ts-grid" style={{ marginTop: 10 }}>
          <label>Phone<input value={newEmpPhone} onChange={(e) => setNewEmpPhone(e.target.value)} /></label>
          <label>Address<input value={newEmpAddress} onChange={(e) => setNewEmpAddress(e.target.value)} /></label>
          <label>City<input value={newEmpCity} onChange={(e) => setNewEmpCity(e.target.value)} /></label>
          <label>Province<input value={newEmpProvince} onChange={(e) => setNewEmpProvince(e.target.value)} /></label>
          <label>Postal Code<input value={newEmpPostal} onChange={(e) => setNewEmpPostal(e.target.value)} /></label>
          <label>Emergency Contact Name<input value={newEmpEmergName} onChange={(e) => setNewEmpEmergName(e.target.value)} /></label>
          <label>Emergency Contact Phone<input value={newEmpEmergPhone} onChange={(e) => setNewEmpEmergPhone(e.target.value)} /></label>
          <label>Notes<input value={newEmpNotes} onChange={(e) => setNewEmpNotes(e.target.value)} /></label>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button className="primary" onClick={createEmployee} disabled={loading}>Add Employee</button>
          <button onClick={loadEmployees} disabled={loading}>Refresh</button>
        </div>
      </div>

      <h2 className="h2">Test Employee PIN</h2>
      <div className="card" style={{ padding: 14, maxWidth: 520 }}>
        <label>
          PIN
          <input value={testPin} onChange={(e) => setTestPin(e.target.value)} placeholder="1234" />
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={runTestPin}>Test</button>
        </div>
        {testPinResult && <p className="subtle" style={{ marginTop: 10 }}>{testPinResult}</p>}
      </div>

      <h2 className="h2">Employee List</h2>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ width: "100%", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                <th style={{ textAlign: "left", padding: 10 }}>Name</th>
                <th style={{ textAlign: "left", padding: 10 }}>PIN</th>
                <th style={{ textAlign: "left", padding: 10 }}>Active</th>
                <th style={{ textAlign: "left", padding: 10 }}>Phone</th>
                <th style={{ textAlign: "left", padding: 10 }}>Emergency</th>
                <th style={{ textAlign: "right", padding: 10 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((emp) => (
                <tr key={emp.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <td style={{ padding: 10 }}>{emp.name}</td>
                  <td style={{ padding: 10 }}>{emp.pin}</td>
                  <td style={{ padding: 10 }}>{emp.active ? "Yes" : "No"}</td>
                  <td style={{ padding: 10 }}>{emp.phone || ""}</td>
                  <td style={{ padding: 10 }}>
                    {(emp.emergency_contact_name || "") + (emp.emergency_contact_phone ? ` (${emp.emergency_contact_phone})` : "")}
                  </td>
                  <td style={{ padding: 10, textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button onClick={() => openEdit(emp)}>Edit</button>
                      {emp.active ? (
                        <button onClick={() => setActive(emp, false)}>Disable</button>
                      ) : (
                        <button className="primary" onClick={() => setActive(emp, true)}>Re-Activate</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td style={{ padding: 12 }} colSpan={6} className="subtle">
                    {loading ? "Loading..." : "No employees found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editEmp && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3 style={{ marginTop: 0 }}>Edit Employee</h3>
            <div className="ts-grid">
              <label>
                Name
                <input value={editEmpName} onChange={(e) => setEditEmpName(e.target.value)} />
              </label>
              <label>
                PIN (4 digits)
                <input value={editEmpPin} onChange={(e) => setEditEmpPin(e.target.value)} />
              </label>
            </div>

            <div className="ts-grid" style={{ marginTop: 10 }}>
              <label>Phone<input value={editEmpPhone} onChange={(e) => setEditEmpPhone(e.target.value)} /></label>
              <label>Address<input value={editEmpAddress} onChange={(e) => setEditEmpAddress(e.target.value)} /></label>
              <label>City<input value={editEmpCity} onChange={(e) => setEditEmpCity(e.target.value)} /></label>
              <label>Province<input value={editEmpProvince} onChange={(e) => setEditEmpProvince(e.target.value)} /></label>
              <label>Postal Code<input value={editEmpPostal} onChange={(e) => setEditEmpPostal(e.target.value)} /></label>
              <label>Emergency Contact Name<input value={editEmpEmergName} onChange={(e) => setEditEmpEmergName(e.target.value)} /></label>
              <label>Emergency Contact Phone<input value={editEmpEmergPhone} onChange={(e) => setEditEmpEmergPhone(e.target.value)} /></label>
              <label>Notes<input value={editEmpNotes} onChange={(e) => setEditEmpNotes(e.target.value)} /></label>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setEditEmp(null)}>Cancel</button>
              <button className="primary" onClick={saveEdit} disabled={loading}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
