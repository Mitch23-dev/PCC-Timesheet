import Head from "next/head";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import AdminTabs from "@/components/AdminTabs";
import { EquipmentCatalogItem, normalizeEquipmentCatalog } from "@/lib/equipmentCatalog";
import { MaterialCatalogSource, normalizeMaterialCatalog } from "@/lib/materialCatalog";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";

type SectionKey = "equipment" | "materials";

type EquipmentClassRow = { id: number; name: string; type: "truck" | "equipment"; hourly_rate: string; payload_tonnes: string; active?: boolean; updated_at?: string | null };
type AttachmentRow = { id: number; equipment_class_id: number; name: string; hourly_rate_addon: string; active?: boolean; updated_at?: string | null };
type MaterialRateRow = {
  id: number;
  name: string;
  source_id: number;
  cost_per_tonne: string;
  markup_percent: string;
  default_truck_class_id: string;
  updated_at?: string | null;
};

function safeGetLocalStorage(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function fmtDate(value?: string | null) {
  if (!value) return "Not set";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", day: "numeric" }).format(d);
}

function toNum(value: string | number | null | undefined) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function createDefaultMaterialRate(id: number, name: string, sourceId: number): MaterialRateRow {
  return { id, name, source_id: sourceId, cost_per_tonne: "", markup_percent: "", default_truck_class_id: "", updated_at: null };
}

function computeLoadPrice(row: MaterialRateRow, truckClass: EquipmentClassRow | undefined) {
  const payload = toNum(truckClass?.payload_tonnes);
  const truckRate = toNum(truckClass?.hourly_rate);
  const materialCost = payload * toNum(row.cost_per_tonne);
  const truckingCost = truckRate * 1.0;
  const subtotal = materialCost + truckingCost;
  const total = subtotal * (1 + (toNum(row.markup_percent) / 100));
  return total > 0 ? total.toFixed(2) : "";
}

export default function RatesPage() {
  const router = useRouter();
  const [adminPw, setAdminPw] = useState("");
  const [activeSection, setActiveSection] = useState<SectionKey>("equipment");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [schemaReady, setSchemaReady] = useState(true);
  const [equipment, setEquipment] = useState<EquipmentCatalogItem[]>([]);
  const [sources, setSources] = useState<MaterialCatalogSource[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedSourceIdx, setSelectedSourceIdx] = useState(0);
  const [equipmentClasses, setEquipmentClasses] = useState<Record<number, EquipmentClassRow>>({});
  const [attachments, setAttachments] = useState<Record<number, AttachmentRow>>({});
  const [materialRates, setMaterialRates] = useState<Record<number, MaterialRateRow>>({});

  useEffect(() => {
    const saved = typeof window !== "undefined" ? safeGetLocalStorage("pcc_admin_pw") : null;
    if (saved) setAdminPw(saved); else router.replace("/admin/signin?returnTo=/admin/rates");
  }, [router]);

  useEffect(() => {
    if (adminPw) loadAll();
  }, [adminPw]);

  async function loadAll() {
    if (!adminPw) return;
    setLoading(true); setError(null); setStatus("Loading rates…");
    try {
      const r = await fetch("/api/admin/rates", { headers: { "x-admin-password": adminPw } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Failed to load rates (HTTP ${r.status})`);
      const nextEquipment = normalizeEquipmentCatalog(Array.isArray(j?.equipment) ? j.equipment : []);
      const nextSources = normalizeMaterialCatalog(Array.isArray(j?.sources) ? j.sources : []);
      setEquipment(nextEquipment);
      setSources(nextSources);
      const classRows = Array.isArray(j?.equipment_classes) ? j.equipment_classes : [];
      setSelectedClassId((prev) => {
        if (prev && classRows.some((row: any) => Number(row.id) === Number(prev))) return prev;
        return classRows.length ? Number(classRows[0].id) : null;
      });
      setSelectedSourceIdx((prev) => Math.max(0, Math.min(prev, Math.max(0, nextSources.length - 1))));
      setEquipmentClasses(Object.fromEntries((Array.isArray(j?.equipment_classes) ? j.equipment_classes : []).map((row: any) => [Number(row.id), { id: Number(row.id), name: String(row.name || ""), type: row?.type === "truck" ? "truck" : "equipment", hourly_rate: row?.hourly_rate == null ? "" : String(row.hourly_rate), payload_tonnes: row?.payload_tonnes == null ? "" : String(row.payload_tonnes), active: row?.active !== false, updated_at: row?.updated_at || null }])));
      setAttachments(Object.fromEntries((Array.isArray(j?.attachments) ? j.attachments : []).map((row: any) => [Number(row.id), { id: Number(row.id), equipment_class_id: Number(row.equipment_class_id), name: String(row.name || ""), hourly_rate_addon: row?.hourly_rate_addon == null ? "" : String(row.hourly_rate_addon), active: row?.active !== false, updated_at: row?.updated_at || null }])));
      setMaterialRates(Object.fromEntries((Array.isArray(j?.material_rows) ? j.material_rows : []).map((row: any) => [Number(row.id), { id: Number(row.id), name: String(row.name || ""), source_id: Number(row.source_id), cost_per_tonne: row?.cost_per_tonne == null ? "" : String(row.cost_per_tonne), markup_percent: row?.markup_percent == null ? "" : String(row.markup_percent), default_truck_class_id: row?.default_truck_class_id == null ? "" : String(row.default_truck_class_id), updated_at: row?.updated_at || null }])));
      setSchemaReady(j?.schemaReady !== false);
      setStatus(j?.schemaReady === false ? "Run the latest SQL migration to enable rate saving." : null);
      setError(j?.schemaReady === false && j?.error ? String(j.error) : null);
    } catch (e: any) {
      setError(e?.message || "Failed to load rates"); setStatus(null);
    } finally { setLoading(false); }
  }

  function signOut() {
    try { window.localStorage.removeItem("pcc_admin_pw"); } catch {}
    router.replace("/admin/signin?returnTo=/admin/rates");
  }

  const classRows = useMemo(() => Object.values(equipmentClasses).sort((a, b) => a.name.localeCompare(b.name)), [equipmentClasses]);
  const selectedClass = useMemo(() => (selectedClassId == null ? null : (equipmentClasses[selectedClassId] || null)), [selectedClassId, equipmentClasses]);
  const selectedSource = useMemo(() => sources[selectedSourceIdx] || null, [sources, selectedSourceIdx]);

  function updateEquipmentClass(id: number, patch: Partial<EquipmentClassRow>) {
    setEquipmentClasses((prev) => ({ ...prev, [id]: { ...(prev[id] || { id, name: "", type: "equipment", hourly_rate: "", payload_tonnes: "" }), ...patch } }));
  }
  function updateAttachment(id: number, patch: Partial<AttachmentRow>) {
    setAttachments((prev) => ({ ...prev, [id]: { ...(prev[id] || { id, equipment_class_id: 0, name: "", hourly_rate_addon: "" }), ...patch } }));
  }
  function addEquipmentClass(type: "truck" | "equipment") {
    const tempId = -Date.now();
    setEquipmentClasses((prev) => ({
      ...prev,
      [tempId]: { id: tempId, name: "", type, hourly_rate: "", payload_tonnes: "", active: true, updated_at: null },
    }));
    setSelectedClassId(tempId);
  }
  function addAttachmentToSelectedClass() {
    if (!selectedClassId) return;
    const tempId = -Date.now();
    setAttachments((prev) => ({
      ...prev,
      [tempId]: { id: tempId, equipment_class_id: selectedClassId, name: "", hourly_rate_addon: "", active: true, updated_at: null },
    }));
  }
  function updateMaterialRate(id: number, patch: Partial<MaterialRateRow>) {
    setMaterialRates((prev) => {
      const base = prev[id] || createDefaultMaterialRate(id, "", 0);
      const next = { ...base, ...patch };
      return { ...prev, [id]: next };
    });
  }

  async function saveRates() {
    if (!adminPw || !schemaReady) return;
    setSaving(true); setError(null); setStatus("Saving rates…");
    try {
      const payload = {
        equipment_classes: Object.values(equipmentClasses).map((row) => (Number(row.id) > 0 ? row : { ...row, id: undefined })),
        attachments: Object.values(attachments).map((row) => (Number(row.id) > 0 ? row : { ...row, id: undefined })),
        material_rows: Object.values(materialRates),
        equipment_assignments: equipment.map((item) => ({ equipment_id: Number(item.id), equipment_class_id: Number((item as any).equipment_class_id || 0) || null })),
      };
      const r = await fetch("/api/admin/rates", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": adminPw }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Failed to save rates (HTTP ${r.status})`);
      setEquipmentClasses((prev) => {
        const copy = { ...prev };
        for (const row of Array.isArray(j?.equipment_classes) ? j.equipment_classes : []) copy[Number(row.id)] = { id: Number(row.id), name: String(row.name || ""), type: row?.type === "truck" ? "truck" : "equipment", hourly_rate: row?.hourly_rate == null ? "" : String(row.hourly_rate), payload_tonnes: row?.payload_tonnes == null ? "" : String(row.payload_tonnes), active: row?.active !== false, updated_at: row?.updated_at || null };
        return copy;
      });
      setAttachments((prev) => {
        const copy = { ...prev };
        for (const row of Array.isArray(j?.attachments) ? j.attachments : []) copy[Number(row.id)] = { id: Number(row.id), equipment_class_id: Number(row.equipment_class_id), name: String(row.name || ""), hourly_rate_addon: row?.hourly_rate_addon == null ? "" : String(row.hourly_rate_addon), active: row?.active !== false, updated_at: row?.updated_at || null };
        return copy;
      });
      setMaterialRates((prev) => {
        const copy = { ...prev };
        for (const row of Array.isArray(j?.material_rows) ? j.material_rows : []) copy[Number(row.id)] = { id: Number(row.id), name: String(row.name || ""), source_id: Number(row.source_id), cost_per_tonne: row?.cost_per_tonne == null ? "" : String(row.cost_per_tonne), markup_percent: row?.markup_percent == null ? "" : String(row.markup_percent), default_truck_class_id: row?.default_truck_class_id == null ? "" : String(row.default_truck_class_id), updated_at: row?.updated_at || null };
        return copy;
      });
      setStatus("Rates saved.");
    } catch (e: any) {
      setError(e?.message || "Failed to save rates"); setStatus(null);
    } finally { setSaving(false); }
  }

  return <>
    <Head><title>Admin · Rates</title></Head>
    <main className="admin-shell">
      <PageHeader
        title="PCC Timesheet Admin"
        subtitle="Keep resource details in Resources, and manage pricing here."
        actions={<button className="btn btn-ghost" onClick={signOut}>Sign out</button>}
      />
      <div className="tabcard">
        <AdminTabs active="rates" />
        <section className="card tabcard-body resources-shell">
          <div className="row resources-header" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 18, flexWrap: "wrap" }}>
            <div>
              <div className="subtle" style={{ textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 900 }}>Admin</div>
              <h2 className="h1" style={{ margin: "6px 0 4px" }}>Rates</h2>
              <div className="subtle">Keep resource details in Resources, and manage pricing here.</div>
            </div>
            <div className="row resources-header-actions" style={{ gap: 10 }}>
              <button className="btn btn-ghost resources-secondary-btn" onClick={loadAll} disabled={loading || saving}>Refresh</button>
              <button className="btn" onClick={saveRates} disabled={loading || saving || !schemaReady}>{saving ? "Saving…" : "Save Rates"}</button>
            </div>
          </div>
          <div className="settings-section-tabs resources-section-tabs" style={{ marginTop: 0 }}>
            <button type="button" className={activeSection === "equipment" ? "resources-section-tab resources-section-tab-active" : "resources-section-tab"} onClick={() => setActiveSection("equipment")}>Equipment Rates</button>
            <button type="button" className={activeSection === "materials" ? "resources-section-tab resources-section-tab-active" : "resources-section-tab"} onClick={() => setActiveSection("materials")}>Material Rates</button>
          </div>
          {(status || error) && <div className="subtle" style={{ marginTop: 10, color: error ? "#b91c1c" : undefined }}>{error || status}</div>}

          {activeSection === "equipment" ? (
            <div className="settings-grid" style={{ marginTop: 14 }}>
              <div className="card resources-panel-card" style={{ padding: 12 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Equipment Classes</div>
                    <div className="subtle">This is the single source of truth for rates and truck payloads.</div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn btn-ghost resources-secondary-btn" type="button" onClick={() => addEquipmentClass("equipment")}>+ Equipment</button>
                    <button className="btn btn-ghost resources-secondary-btn" type="button" onClick={() => addEquipmentClass("truck")}>+ Truck</button>
                  </div>
                </div>
                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  {classRows.length === 0 && <div className="subtle">No classes yet. Add one to begin.</div>}
                  {classRows.map((row) => {
                    return <button key={String(row.id)} type="button" className={Number(selectedClassId) === Number(row.id) ? "input settings-source-button resources-list-button resources-list-button-selected" : "input settings-source-button resources-list-button"} style={{ textAlign: "left" }} onClick={() => setSelectedClassId(Number(row.id))}><div className="settings-source-button-inner"><div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name || "New class"}</div><div className="subtle">{row.type === "truck" ? "Truck" : "Equipment"}{row.hourly_rate ? ` • $${row.hourly_rate}/hr` : ""}</div></div></div></button>;
                  })}
                </div>
              </div>
              <div className="card resources-panel-card" style={{ padding: 12 }}>
                <div>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>Class Rates Editor</div>
                      <div className="subtle">Create and edit classes here. No direct DB edits needed.</div>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn btn-ghost resources-secondary-btn" type="button" onClick={() => addEquipmentClass("equipment")}>+ Equipment</button>
                      <button className="btn btn-ghost resources-secondary-btn" type="button" onClick={() => addEquipmentClass("truck")}>+ Truck</button>
                    </div>
                  </div>
                  <div className="card resources-subitem-card" style={{ padding: 0, marginTop: 12 }}>
                    <DataTable>
                      <table className="rates-table">
                        <thead><tr><th>Class</th><th>Type</th><th>Hourly Rate</th><th>Payload Tonnes</th><th>Updated</th></tr></thead>
                        <tbody>
                          {classRows.length === 0 && <tr><td colSpan={5} className="subtle" style={{ padding: 14 }}>No classes yet. Use + Equipment or + Truck.</td></tr>}
                          {classRows.map((row) => (
                            <tr key={String(row.id)} onClick={() => setSelectedClassId(Number(row.id))} style={{ cursor: "pointer" }}>
                              <td><input className="input" value={row.name || ""} placeholder="Class name" onChange={(e) => updateEquipmentClass(Number(row.id), { name: e.target.value })} /></td>
                              <td><select className="input" value={row.type} onChange={(e) => updateEquipmentClass(Number(row.id), { type: e.target.value as "truck" | "equipment" })}><option value="equipment">Equipment</option><option value="truck">Truck</option></select></td>
                              <td><input className="input" inputMode="decimal" value={row.hourly_rate || ""} placeholder="0.00" onChange={(e) => updateEquipmentClass(Number(row.id), { hourly_rate: e.target.value })} /></td>
                              <td><input className="input" inputMode="decimal" value={row.payload_tonnes || ""} placeholder={row.type === "truck" ? "e.g. 16" : "N/A"} onChange={(e) => updateEquipmentClass(Number(row.id), { payload_tonnes: e.target.value })} disabled={row.type !== "truck"} /></td>
                              <td>{fmtDate(row.updated_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </DataTable>
                  </div>
                </div>

                {!selectedClass ? <div className="subtle" style={{ marginTop: 14 }}>Select a class row above to manage its attachments.</div> : <>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>Class Details</div>
                      <div className="subtle">Rates and payloads are managed at class level.</div>
                    </div>
                  </div>
                  <div className="settings-material-row resources-subitem-grid" style={{ marginTop: 12 }}>
                    <label><div className="label">Class Name</div><input className="input" value={selectedClass.name || ""} onChange={(e) => updateEquipmentClass(Number(selectedClass.id), { name: e.target.value })} /></label>
                    <label><div className="label">Type</div><select className="input" value={selectedClass.type} onChange={(e) => updateEquipmentClass(Number(selectedClass.id), { type: e.target.value as "truck" | "equipment" })}><option value="equipment">Equipment</option><option value="truck">Truck</option></select></label>
                    <label><div className="label">Hourly Rate</div><input className="input" inputMode="decimal" value={selectedClass.hourly_rate || ""} onChange={(e) => updateEquipmentClass(Number(selectedClass.id), { hourly_rate: e.target.value })} /></label>
                    <label><div className="label">Payload Tonnes (truck only)</div><input className="input" inputMode="decimal" value={selectedClass.payload_tonnes || ""} onChange={(e) => updateEquipmentClass(Number(selectedClass.id), { payload_tonnes: e.target.value })} disabled={selectedClass.type !== "truck"} /></label>
                    <div><div className="label">Updated</div><div className="input" style={{ display: "flex", alignItems: "center" }}>{fmtDate(selectedClass.updated_at)}</div></div>
                  </div>
                  <div className="resources-subsection" style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(0,0,0,.08)" }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>Attachments</div>
                        <div className="subtle" style={{ marginTop: 6 }}>Attachments are class-specific and filtered in estimating.</div>
                      </div>
                      <button className="btn btn-ghost resources-secondary-btn" type="button" onClick={addAttachmentToSelectedClass}>+ Add Attachment</button>
                    </div>
                    <div className="card resources-subitem-card" style={{ padding: 0, marginTop: 12 }}>
                      <DataTable>
                      <table className="rates-table">
                        <thead><tr><th>Attachment</th><th>Rate / hr</th><th>Updated</th></tr></thead>
                        <tbody>
                          {Object.values(attachments).filter((row) => Number(row.equipment_class_id) === Number(selectedClass.id)).length === 0 && <tr><td colSpan={3} className="subtle" style={{ padding: 14 }}>No class attachments.</td></tr>}
                          {Object.values(attachments).filter((row) => Number(row.equipment_class_id) === Number(selectedClass.id)).map((attachment) => <tr key={String(attachment.id)}><td><input className="input" value={attachment.name} onChange={(e) => updateAttachment(Number(attachment.id), { name: e.target.value })} /></td><td style={{ minWidth: 170 }}><input className="input" inputMode="decimal" placeholder="0.00" value={attachment.hourly_rate_addon ?? ""} onChange={(e) => updateAttachment(Number(attachment.id), { hourly_rate_addon: e.target.value })} /></td><td>{fmtDate(attachment.updated_at)}</td></tr>)}
                        </tbody>
                      </table>
                      </DataTable>
                    </div>
                  </div>
                </>}
                <div className="resources-subsection" style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(0,0,0,.08)" }}>
                  <div style={{ fontWeight: 900 }}>Equipment Unit Mapping</div>
                  <div className="subtle" style={{ marginTop: 6 }}>Assign each physical unit to a class.</div>
                  <div className="card resources-subitem-card" style={{ padding: 0, marginTop: 12 }}>
                    <DataTable>
                      <table className="rates-table">
                        <thead><tr><th>Unit</th><th>Class</th></tr></thead>
                        <tbody>
                          {equipment.length === 0 && <tr><td colSpan={2} className="subtle" style={{ padding: 14 }}>No equipment units found.</td></tr>}
                          {equipment.map((item) => <tr key={String(item.id)}><td>{item.name}</td><td><select className="input" value={String((item as any).equipment_class_id || "")} onChange={(e) => setEquipment((prev) => prev.map((row) => Number(row.id) === Number(item.id) ? ({ ...row, equipment_class_id: e.target.value ? Number(e.target.value) : null } as any) : row))}><option value="">Unassigned</option>{classRows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></td></tr>)}
                        </tbody>
                      </table>
                    </DataTable>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="settings-grid" style={{ marginTop: 14 }}>
              <div className="card resources-panel-card" style={{ padding: 12 }}>
                <div style={{ fontWeight: 900 }}>Sources</div>
                <div className="subtle">Click a source and the material rate table opens beside it.</div>
                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  {sources.length === 0 && <div className="subtle">No material sources found in Resources yet.</div>}
                  {sources.map((source, idx) => <button key={String(source.id || `source-${idx}`)} type="button" className={idx === selectedSourceIdx ? "input settings-source-button resources-list-button resources-list-button-selected" : "input settings-source-button resources-list-button"} style={{ textAlign: "left" }} onClick={() => setSelectedSourceIdx(idx)}><div className="settings-source-button-inner"><div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{source.name}</div><div className="subtle">{source.materials.length} material{source.materials.length === 1 ? "" : "s"}</div></div></div></button>)}
                </div>
              </div>
              <div className="card resources-panel-card" style={{ padding: 12 }}>
                {!selectedSource ? <div className="subtle">Select a source to edit its rates.</div> : <>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{selectedSource.name}</div>
                      <div className="subtle">Load price is calculated from cost/tonne, class payload, class hourly rate, and markup.</div>
                    </div>
                  </div>
                  <div className="subtle" style={{ marginTop: 8 }}>Displayed load price uses a 1.0 hour cycle for quick reference on this page.</div>
                  <div className="card resources-subitem-card" style={{ padding: 0, marginTop: 12 }}>
                    <DataTable>
                    <table className="rates-table">
                      <thead><tr><th>Material</th><th>$/tonne</th><th>Markup %</th><th>Default Truck Class</th><th>Load price (calc)</th><th>Updated</th></tr></thead>
                      <tbody>
                        {selectedSource.materials.length === 0 && <tr><td colSpan={6} className="subtle" style={{ padding: 14 }}>No materials in this source yet.</td></tr>}
                        {selectedSource.materials.map((material) => {
                          const rate = materialRates[Number(material.id)] || createDefaultMaterialRate(Number(material.id), material.name, Number(selectedSource.id || 0));
                          const truckClass = equipmentClasses[Number(rate.default_truck_class_id)];
                          return <tr key={String(material.id)}>
                            <td>{material.name}</td>
                            <td style={{ minWidth: 130 }}><input className="input" inputMode="decimal" placeholder="0.00" value={rate.cost_per_tonne ?? ""} onChange={(e) => updateMaterialRate(Number(material.id), { id: Number(material.id), name: material.name, source_id: Number(selectedSource.id || 0), cost_per_tonne: e.target.value })} /></td>
                            <td style={{ minWidth: 120 }}><input className="input" inputMode="decimal" placeholder="0" value={rate.markup_percent ?? ""} onChange={(e) => updateMaterialRate(Number(material.id), { markup_percent: e.target.value })} /></td>
                            <td style={{ minWidth: 180 }}>
                              <select className="input" value={rate.default_truck_class_id || ""} onChange={(e) => updateMaterialRate(Number(material.id), { default_truck_class_id: e.target.value })}>
                                <option value="">Select truck class</option>
                                {Object.values(equipmentClasses).filter((row) => row.type === "truck" && row.active !== false).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                              </select>
                            </td>
                            <td style={{ minWidth: 140 }}><input className="input" value={computeLoadPrice(rate, truckClass)} readOnly style={{ fontWeight: 800, background: "rgba(249,115,22,.08)" }} /></td>
                            <td>{fmtDate(rate.updated_at)}</td>
                          </tr>;
                        })}
                      </tbody>
                    </table>
                    </DataTable>
                  </div>
                </>}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  </>;
}
