import Head from "next/head";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import AdminTabs from "../../../components/AdminTabs";
import ScrollableDropdown from "@/components/ScrollableDropdown";

type EmployeeFull = {
  id: number;
  name: string;
  pin: string;
  active: boolean;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  position: string | null;
  employment_type: string | null;
  hourly_rate: number | null;
  start_date: string | null;
  end_date: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  created_at: string;
};

function safeGetLocalStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export default function AdminEmployeeDetailPage() {
  const router = useRouter();
  const idParam = router.query.id;
  const empId = useMemo(() => {
    const raw = Array.isArray(idParam) ? idParam[0] : idParam;
    const n = raw ? Number(raw) : NaN;
    return Number.isNaN(n) ? null : n;
  }, [idParam]);

  const [adminPw, setAdminPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [emp, setEmp] = useState<EmployeeFull | null>(null);

  // form state
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [active, setActive] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [position, setPosition] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [hourlyRate, setHourlyRate] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [emergName, setEmergName] = useState("");
  const [emergPhone, setEmergPhone] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? safeGetLocalStorage("pcc_admin_pw") : null;
    if (saved) {
      setAdminPw(saved);
    } else {
      router.replace(`/admin/signin?returnTo=${encodeURIComponent(router.asPath)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function signOut() {
    try {
      window.localStorage.removeItem("pcc_admin_pw");
    } catch {}
    router.replace(`/admin/signin?returnTo=${encodeURIComponent(router.asPath)}`);
  }

  async function loadEmployee() {
    if (!adminPw || !empId) return;
    setLoading(true);
    setError(null);
    setStatus("Loading employee…");
    try {
      const r = await fetch(`/api/admin/employees/get?id=${empId}`, {
        method: "GET",
        headers: { "x-admin-password": adminPw },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Failed to load employee (HTTP ${r.status})`);
      const e = data.employee as EmployeeFull;
      setEmp(e);

      setName(String(e.name ?? ""));
      setPin(String(e.pin ?? ""));
      setActive(Boolean(e.active));
      setFirstName(String(e.first_name ?? ""));
      setLastName(String(e.last_name ?? ""));
      setEmail(String(e.email ?? ""));
      setPhone(String(e.phone ?? ""));
      setAddress(String(e.address ?? ""));
      setCity(String(e.city ?? ""));
      setProvince(String(e.province ?? ""));
      setPostalCode(String(e.postal_code ?? ""));
      setPosition(String(e.position ?? ""));
      setEmploymentType(String(e.employment_type ?? ""));
      setHourlyRate(e.hourly_rate === null || e.hourly_rate === undefined ? "" : String(e.hourly_rate));
      setStartDate(String(e.start_date ?? ""));
      setEndDate(String(e.end_date ?? ""));
      setEmergName(String(e.emergency_contact_name ?? ""));
      setEmergPhone(String(e.emergency_contact_phone ?? ""));
      setNotes(String(e.notes ?? ""));

      setStatus(null);
    } catch (e: any) {
      setStatus(null);
      setError(e?.message || "Failed to load employee.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (adminPw && empId) loadEmployee();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPw, empId]);

  async function save() {
    if (!adminPw || !empId) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const payload: any = {
        id: empId,
        name,
        pin,
        active,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        address,
        city,
        province,
        postal_code: postalCode,
        position,
        employment_type: employmentType,
        hourly_rate: hourlyRate,
        start_date: startDate,
        end_date: endDate,
        emergency_contact_name: emergName,
        emergency_contact_phone: emergPhone,
        notes,
      };

      const r = await fetch("/api/admin/employees/update", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPw },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Save failed (HTTP ${r.status})`);
      setStatus("Saved.");
      setEmp(data.employee);
    } catch (e: any) {
      setError(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function setActiveNow(nextActive: boolean) {
    if (!adminPw || !empId) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const r = await fetch("/api/admin/employees/set_active", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPw },
        body: JSON.stringify({ id: empId, active: nextActive }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Update failed (HTTP ${r.status})`);
      setActive(nextActive);
      setStatus(nextActive ? "Employee activated." : "Employee deactivated.");
      await loadEmployee();
    } catch (e: any) {
      setError(e?.message || "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  const title = emp ? `Employee — ${emp.name}` : "Employee";

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
        <div className="tabcard">
          <AdminTabs active="employees" />
          <div className="card tabcard-body" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => router.push("/admin/employees")} className="btn btn-ghost btn-compact">
                ← Back
              </button>
              <h1 style={{ margin: 0 }}>{emp ? emp.name : "Employee"}</h1>
            </div>
            <div style={{ opacity: 0.8, marginTop: 4 }}>Edit details, then Save.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={loadEmployee} disabled={loading || !empId} className="btn btn-ghost btn-compact">
              Refresh
            </button>
            <button onClick={save} disabled={saving || !empId} className="btn btn-primary btn-compact">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={signOut} className="btn btn-ghost btn-compact">
              Sign out
            </button>
          </div>
        </div>

        {error ? (
          <div style={{ background: "#ffe8e8", border: "1px solid #ffb3b3", padding: 12, marginTop: 12, borderRadius: 8 }}>{error}</div>
        ) : null}
        {status ? <div style={{ marginTop: 12, opacity: 0.85 }}>{status}</div> : null}

        <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Core</h2>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Name (display)</div>
              <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", padding: 10 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>PIN (4 digits)</div>
              <input value={pin} onChange={(e) => setPin(e.target.value)} style={{ width: "100%", padding: 10 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Status</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0" }}>
                <div style={{ fontWeight: 700 }}>{active ? "Active" : "Inactive"}</div>
                {active ? (
                  <button
                    onClick={() => setActiveNow(false)}
                    disabled={saving || loading}
                    className="btn btn-danger btn-compact"
                    type="button"
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    onClick={() => setActiveNow(true)}
                    disabled={saving || loading}
                    className="btn btn-primary btn-compact"
                    type="button"
                  >
                    Activate
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>First name</div>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ width: "100%", padding: 10 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Last name</div>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ width: "100%", padding: 10 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Position</div>
              <input value={position} onChange={(e) => setPosition(e.target.value)} style={{ width: "100%", padding: 10 }} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Contact</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Email</div>
              <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", padding: 10 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Phone</div>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: "100%", padding: 10 }} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Address</div>
              <input value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: "100%", padding: 10 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>City</div>
              <input value={city} onChange={(e) => setCity(e.target.value)} style={{ width: "100%", padding: 10 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Province</div>
              <input value={province} onChange={(e) => setProvince(e.target.value)} style={{ width: "100%", padding: 10 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Postal code</div>
              <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} style={{ width: "100%", padding: 10 }} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Employment</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Type</div>
              <ScrollableDropdown
                value={employmentType}
                options={["Hourly", "Salary", "Contract"]}
                onChange={(next) => setEmploymentType(next)}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Hourly rate</div>
              <input value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="30.00" style={{ width: "100%", padding: 10 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Start date</div>
              <input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="YYYY-MM-DD" style={{ width: "100%", padding: 10 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>End date</div>
              <input value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="YYYY-MM-DD" style={{ width: "100%", padding: 10 }} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Emergency Contact</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Name</div>
              <input value={emergName} onChange={(e) => setEmergName(e.target.value)} style={{ width: "100%", padding: 10 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Phone</div>
              <input value={emergPhone} onChange={(e) => setEmergPhone(e.target.value)} style={{ width: "100%", padding: 10 }} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Notes</h2>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: "100%", padding: 10, minHeight: 120 }} />
        </div>

        <div style={{ marginTop: 16, opacity: 0.75 }}>
          {emp ? (
            <div>
              ID: {emp.id} • Created: {emp.created_at ? new Date(emp.created_at).toLocaleString() : "—"}
            </div>
          ) : null}
        </div>
          </div>
        </div>
      </div>
    </>
  );
}
