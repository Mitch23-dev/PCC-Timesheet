import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import EmployeeTabs from "@/components/EmployeeTabs";
import ScrollableDropdown from "@/components/ScrollableDropdown";
import { EquipmentCatalogItem, flattenEquipmentCatalog, normalizeEquipmentCatalog } from "@/lib/equipmentCatalog";
import PageHeader from "@/components/ui/PageHeader";
import SectionHeader from "@/components/ui/SectionHeader";

type SessionEmployee = { id: string; name: string; timesheet_type?: string | null };

export default function EquipmentReferencePage() {
  const router = useRouter();
  const [employee, setEmployee] = useState<SessionEmployee | null>(null);
  const [catalog, setCatalog] = useState<EquipmentCatalogItem[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const sessionRes = await fetch("/api/me/session");
        const sessionJson = await sessionRes.json();
        if (!sessionJson?.loggedIn) {
          router.replace("/");
          return;
        }
        if (sessionJson?.employee?.timesheet_type !== "mechanic") {
          router.replace("/");
          return;
        }
        setEmployee(sessionJson.employee);

        const r = await fetch("/api/equipment-catalog");
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Failed to load equipment");
        const normalized = normalizeEquipmentCatalog(Array.isArray(j?.equipment) ? j.equipment : []).filter((item) => item.is_active !== false);
        setCatalog(normalized);
        if (normalized.length) setSelected(normalized[0].name);
      } catch (e: any) {
        setError(e?.message || "Failed to load equipment information");
      }
    })();
  }, [router]);

  const options = useMemo(() => flattenEquipmentCatalog(catalog), [catalog]);
  const selectedEquipment = useMemo(() => catalog.find((item) => item.name === selected) || null, [catalog, selected]);

  async function logout() {
    try {
      await fetch("/api/me/logout", { method: "POST" });
    } catch {
      // ignore
    }
    router.replace("/");
  }

  return (
    <main className="page my-shell">
      <div className="tabcard">
        <EmployeeTabs active="equipment" timesheetType={employee?.timesheet_type} />
        <section className="card tabcard-body employee-panel-card">
          <PageHeader
            title="Equipment Information"
            subtitle={employee ? <>Signed in as <strong>{employee.name}</strong></> : undefined}
            actions={<button className="btn btn-ghost employee-secondary-btn" onClick={logout}>Sign out</button>}
          />

          {error ? <div className="alert alert-bad" style={{ marginTop: 14 }}>{error}</div> : null}

          <div className="employee-panel-card ui-card-pad" style={{ marginTop: 14 }}>
            <SectionHeader title="Select Equipment" />
            <ScrollableDropdown
              value={selected}
              options={options}
              placeholder="Select equipment"
              onChange={setSelected}
            />
          </div>

          {selectedEquipment ? (
            <div className="employee-panel-card ui-card-pad" style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{selectedEquipment.name}</div>
                  <div className="subtle">Reference details for mechanic time entry</div>
                </div>
                <div className="employee-soft-chip">{selectedEquipment.attachments.filter((item) => item.is_active !== false).length} attachments</div>
              </div>

              <div className="resources-equipment-meta-grid" style={{ marginTop: 14 }}>
                <div className="resources-meta-card">
                  <div className="subtle">Unit Number</div>
                  <div style={{ fontWeight: 800, marginTop: 4 }}>{selectedEquipment.unit_number || "—"}</div>
                </div>
                <div className="resources-meta-card">
                  <div className="subtle">Year</div>
                  <div style={{ fontWeight: 800, marginTop: 4 }}>{selectedEquipment.equipment_year || "—"}</div>
                </div>
                <div className="resources-meta-card">
                  <div className="subtle">Model</div>
                  <div style={{ fontWeight: 800, marginTop: 4 }}>{selectedEquipment.model || "—"}</div>
                </div>
                <div className="resources-meta-card">
                  <div className="subtle">VIN Number</div>
                  <div style={{ fontWeight: 800, marginTop: 4, wordBreak: "break-word" }}>{selectedEquipment.vin_number || "—"}</div>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Available Attachments</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {selectedEquipment.attachments.filter((item) => item.is_active !== false).length ? (
                    selectedEquipment.attachments.filter((item) => item.is_active !== false).map((attachment) => (
                      <span key={String(attachment.id || attachment.name)} className="employee-soft-chip">{attachment.name}</span>
                    ))
                  ) : (
                    <span className="subtle">No attachment options listed for this unit.</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="subtle" style={{ marginTop: 14 }}>No equipment available.</div>
          )}
        </section>
      </div>
    </main>
  );
}
