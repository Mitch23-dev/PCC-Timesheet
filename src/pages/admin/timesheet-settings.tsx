import Head from "next/head";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import AdminTabs from "../../components/AdminTabs";
import { MaterialCatalogSource, normalizeMaterialCatalog } from "@/lib/materialCatalog";
import { EquipmentCatalogItem, normalizeEquipmentCatalog } from "@/lib/equipmentCatalog";
import PageHeader from "@/components/ui/PageHeader";

type SectionKey = "materials" | "equipment";

function safeGetLocalStorage(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export default function ResourcesPage() {
  const router = useRouter();
  const [adminPw, setAdminPw] = useState("");
  const [activeSection, setActiveSection] = useState<SectionKey>("materials");
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsSaving, setMaterialsSaving] = useState(false);
  const [materialsStatus, setMaterialsStatus] = useState<string | null>(null);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const [materialsSchemaReady, setMaterialsSchemaReady] = useState(true);
  const [sources, setSources] = useState<MaterialCatalogSource[]>([]);
  const [selectedSourceIdx, setSelectedSourceIdx] = useState(0);
  const [draggingSourceIdx, setDraggingSourceIdx] = useState<number | null>(null);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [equipmentSaving, setEquipmentSaving] = useState(false);
  const [equipmentStatus, setEquipmentStatus] = useState<string | null>(null);
  const [equipmentError, setEquipmentError] = useState<string | null>(null);
  const [equipmentSchemaReady, setEquipmentSchemaReady] = useState(true);
  const [equipmentCatalog, setEquipmentCatalog] = useState<EquipmentCatalogItem[]>([]);
  const [selectedEquipmentIdx, setSelectedEquipmentIdx] = useState(0);
  const [draggingEquipmentIdx, setDraggingEquipmentIdx] = useState<number | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? safeGetLocalStorage("pcc_admin_pw") : null;
    if (saved) setAdminPw(saved); else router.replace("/admin/signin?returnTo=/admin/timesheet-settings");
  }, [router]);

  useEffect(() => {
    if (adminPw) { loadMaterials(); loadEquipment(); }
  }, [adminPw]);

  function signOut() {
    try { window.localStorage.removeItem("pcc_admin_pw"); } catch {}
    router.replace("/admin/signin?returnTo=/admin/timesheet-settings");
  }

  async function loadMaterials() {
    if (!adminPw) return;
    setMaterialsLoading(true); setMaterialsError(null); setMaterialsStatus("Loading resources…");
    try {
      const r = await fetch("/api/admin/material-catalog", { headers: { "x-admin-password": adminPw } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Failed to load materials (HTTP ${r.status})`);
      const catalog = normalizeMaterialCatalog(Array.isArray(j?.sources) ? j.sources : []);
      setSources(catalog); setMaterialsSchemaReady(j?.schemaReady !== false);
      setSelectedSourceIdx((prev) => Math.max(0, Math.min(prev, Math.max(0, catalog.length - 1))));
      setMaterialsStatus(j?.usingFallback ? "Showing fallback materials until the latest SQL migration is run." : null);
      setMaterialsError(j?.schemaReady === false && j?.error ? String(j.error) : null);
    } catch (e: any) { setMaterialsError(e?.message || "Failed to load materials"); setMaterialsStatus(null); }
    finally { setMaterialsLoading(false); }
  }

  async function loadEquipment() {
    if (!adminPw) return;
    setEquipmentLoading(true); setEquipmentError(null); setEquipmentStatus("Loading resources…");
    try {
      const r = await fetch("/api/admin/equipment-catalog", { headers: { "x-admin-password": adminPw } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Failed to load equipment (HTTP ${r.status})`);
      const catalog = normalizeEquipmentCatalog(Array.isArray(j?.equipment) ? j.equipment : []);
      setEquipmentCatalog(catalog); setEquipmentSchemaReady(j?.schemaReady !== false);
      setSelectedEquipmentIdx((prev) => Math.max(0, Math.min(prev, Math.max(0, catalog.length - 1))));
      setEquipmentStatus(j?.usingFallback ? "Showing fallback equipment until the latest SQL migration is run." : null);
      setEquipmentError(j?.schemaReady === false && j?.error ? String(j.error) : null);
    } catch (e: any) { setEquipmentError(e?.message || "Failed to load equipment"); setEquipmentStatus(null); }
    finally { setEquipmentLoading(false); }
  }

  const selectedSource = useMemo(() => sources[selectedSourceIdx] || null, [sources, selectedSourceIdx]);
  const selectedEquipment = useMemo(() => equipmentCatalog[selectedEquipmentIdx] || null, [equipmentCatalog, selectedEquipmentIdx]);
  const sectionStatus = activeSection === "materials" ? materialsStatus : equipmentStatus;
  const sectionError = activeSection === "materials" ? materialsError : equipmentError;
  const sectionSchemaReady = activeSection === "materials" ? materialsSchemaReady : equipmentSchemaReady;
  const sectionLoading = activeSection === "materials" ? materialsLoading : equipmentLoading;
  const sectionSaving = activeSection === "materials" ? materialsSaving : equipmentSaving;

  function updateSource(idx: number, patch: Partial<MaterialCatalogSource>) { setSources((prev) => prev.map((source, i) => (i === idx ? { ...source, ...patch } : source))); }
  function addSource() { setSources((prev) => { const next = [...prev, { name: "", is_active: true, sort_order: prev.length + 1, materials: [{ name: "", is_active: true, sort_order: 1 }] }]; setSelectedSourceIdx(next.length - 1); return next; }); }
  function removeSource(idx: number) { setSources((prev) => { const next = prev.filter((_, i) => i !== idx); setSelectedSourceIdx(Math.max(0, Math.min(idx - 1, next.length - 1))); return next; }); }
  function moveSource(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    setSources((prev) => { if (fromIdx >= prev.length || toIdx >= prev.length) return prev; const next = [...prev]; const [moved] = next.splice(fromIdx, 1); next.splice(toIdx, 0, moved); return next; });
    setSelectedSourceIdx((current) => current === fromIdx ? toIdx : (fromIdx < toIdx && current > fromIdx && current <= toIdx) ? current - 1 : (fromIdx > toIdx && current >= toIdx && current < fromIdx) ? current + 1 : current);
  }
  function addMaterial() { if (!selectedSource) return; setSources((prev) => prev.map((source, i) => i !== selectedSourceIdx ? source : { ...source, materials: [...source.materials, { name: "", is_active: true, sort_order: source.materials.length + 1 }] })); }
  function updateMaterial(matIdx: number, patch: any) { setSources((prev) => prev.map((source, i) => i !== selectedSourceIdx ? source : { ...source, materials: source.materials.map((material, j) => j === matIdx ? { ...material, ...patch } : material) })); }
  function removeMaterial(matIdx: number) { setSources((prev) => prev.map((source, i) => i !== selectedSourceIdx ? source : { ...source, materials: source.materials.filter((_, j) => j !== matIdx) })); }
  async function saveMaterials() {
    if (!adminPw) return; setMaterialsSaving(true); setMaterialsError(null); setMaterialsStatus("Saving resources…");
    try {
      const payload = sources
        .map((source, idx) => ({
          ...source,
          name: String(source.name || "").trim(),
          sort_order: idx + 1,
          materials: (Array.isArray(source.materials) ? source.materials : []).map((material, matIdx) => ({
            ...material,
            name: String(material.name || "").trim(),
            sort_order: matIdx + 1,
          })),
        }))
        .filter((source) => source.name);
      const r = await fetch("/api/admin/material-catalog", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": adminPw }, body: JSON.stringify({ sources: payload }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error || `Failed to save materials (HTTP ${r.status})`);
      const catalog = normalizeMaterialCatalog(Array.isArray(j?.sources) ? j.sources : payload); setSources(catalog); setSelectedSourceIdx((prev) => Math.max(0, Math.min(prev, Math.max(0, catalog.length - 1)))); setMaterialsStatus("Resources saved.");
    } catch (e: any) { setMaterialsError(e?.message || "Failed to save materials"); setMaterialsStatus(null); }
    finally { setMaterialsSaving(false); }
  }

  function updateEquipment(idx: number, patch: Partial<EquipmentCatalogItem>) { setEquipmentCatalog((prev) => prev.map((item, i) => i === idx ? { ...item, ...patch } : item)); }
  function addEquipment() { setEquipmentCatalog((prev) => { const next = [...prev, { name: "", unit_number: "", equipment_year: "", model: "", vin_number: "", is_active: true, sort_order: prev.length + 1, attachments: [] }]; setSelectedEquipmentIdx(next.length - 1); return next; }); }
  function removeEquipment(idx: number) { setEquipmentCatalog((prev) => { const next = prev.filter((_, i) => i !== idx); setSelectedEquipmentIdx(Math.max(0, Math.min(idx - 1, next.length - 1))); return next; }); }
  function moveEquipment(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    setEquipmentCatalog((prev) => { if (fromIdx >= prev.length || toIdx >= prev.length) return prev; const next = [...prev]; const [moved] = next.splice(fromIdx, 1); next.splice(toIdx, 0, moved); return next; });
    setSelectedEquipmentIdx((current) => current === fromIdx ? toIdx : (fromIdx < toIdx && current > fromIdx && current <= toIdx) ? current - 1 : (fromIdx > toIdx && current >= toIdx && current < fromIdx) ? current + 1 : current);
  }
  function addAttachment() { if (!selectedEquipment) return; setEquipmentCatalog((prev) => prev.map((item, i) => i !== selectedEquipmentIdx ? item : { ...item, attachments: [...item.attachments, { name: "", is_active: true, sort_order: item.attachments.length + 1 }] })); }
  function updateAttachment(attIdx: number, patch: any) { setEquipmentCatalog((prev) => prev.map((item, i) => i !== selectedEquipmentIdx ? item : { ...item, attachments: item.attachments.map((attachment, j) => j === attIdx ? { ...attachment, ...patch } : attachment) })); }
  function removeAttachment(attIdx: number) { setEquipmentCatalog((prev) => prev.map((item, i) => i !== selectedEquipmentIdx ? item : { ...item, attachments: item.attachments.filter((_, j) => j !== attIdx) })); }
  async function saveEquipment() {
    if (!adminPw) return; setEquipmentSaving(true); setEquipmentError(null); setEquipmentStatus("Saving resources…");
    try {
      const payload = equipmentCatalog
        .map((item, idx) => ({
          ...item,
          name: String(item.name || "").trim(),
          unit_number: String(item.unit_number || "").trim(),
          equipment_year: String(item.equipment_year || "").trim(),
          model: String(item.model || "").trim(),
          vin_number: String(item.vin_number || "").trim(),
          sort_order: idx + 1,
          attachments: (Array.isArray(item.attachments) ? item.attachments : []).map((attachment, attIdx) => ({
            ...attachment,
            name: String(attachment.name || "").trim(),
            sort_order: attIdx + 1,
          })),
        }))
        .filter((item) => item.name);
      const r = await fetch("/api/admin/equipment-catalog", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": adminPw }, body: JSON.stringify({ equipment: payload }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error || `Failed to save equipment (HTTP ${r.status})`);
      const catalog = normalizeEquipmentCatalog(Array.isArray(j?.equipment) ? j.equipment : payload); setEquipmentCatalog(catalog); setSelectedEquipmentIdx((prev) => Math.max(0, Math.min(prev, Math.max(0, catalog.length - 1)))); setEquipmentStatus("Resources saved.");
    } catch (e: any) { setEquipmentError(e?.message || "Failed to save equipment"); setEquipmentStatus(null); }
    finally { setEquipmentSaving(false); }
  }

  return (
    <>
      <Head><title>Admin · Resources</title></Head>
      <main className="admin-shell">
        <PageHeader
          title="PCC Timesheet Admin"
          subtitle="Manage the resource dropdowns used throughout the employee timesheet."
          actions={<button className="btn btn-ghost" onClick={signOut}>Sign out</button>}
        />
        <div className="tabcard">
          <AdminTabs active="settings" />
          <section className="card tabcard-body resources-shell">
            <div className="row resources-header" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
              <div className="settings-section-tabs resources-section-tabs" style={{ marginTop: 0 }}>
              <button type="button" className={activeSection === "materials" ? "resources-section-tab resources-section-tab-active" : "resources-section-tab"} onClick={() => setActiveSection("materials")}>Materials</button>
              <button type="button" className={activeSection === "equipment" ? "resources-section-tab resources-section-tab-active" : "resources-section-tab"} onClick={() => setActiveSection("equipment")}>Equipment</button>
            </div>
              <div className="row resources-header-actions" style={{ gap: 8 }}>
                <button className="btn btn-ghost resources-secondary-btn" onClick={activeSection === "materials" ? loadMaterials : loadEquipment} disabled={sectionLoading || sectionSaving}>Refresh</button>
                <button className="btn btn-primary" onClick={activeSection === "materials" ? saveMaterials : saveEquipment} disabled={sectionLoading || sectionSaving}>Save Changes</button>
              </div>
            </div>
            {sectionStatus && <div className="alert" style={{ marginTop: 12, background: "rgba(244,122,31,.12)", border: "1px solid rgba(244,122,31,.22)" }}>{sectionStatus}</div>}
            {sectionError && <div className="alert alert-bad" style={{ marginTop: 12 }}>{sectionError}</div>}
            {!sectionSchemaReady && <div className="alert" style={{ marginTop: 12, background: "rgba(0,0,0,.05)", border: "1px solid rgba(0,0,0,.08)" }}>The new {activeSection === "materials" ? "material" : "equipment"} catalog tables are not in Supabase yet. Run the latest SQL migration before saving here.</div>}

            {activeSection === "materials" ? (
              <div className="settings-grid" style={{ marginTop: 14 }}>
                <div className="card resources-panel-card" style={{ padding: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontWeight: 900 }}>Sources</div><div className="subtle">Drag sources to change the dropdown order.</div></div><button className="btn btn-ghost resources-secondary-btn" onClick={addSource} disabled={sectionSaving}>+ Add Source</button></div>
                  <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    {sources.length === 0 && <div className="subtle">No sources yet.</div>}
                    {sources.map((source, idx) => {
                      const isSelected = idx === selectedSourceIdx; const isDragging = idx === draggingSourceIdx;
                      return <button key={String(source.id || `source-${idx}`)} type="button" draggable={!sectionSaving} className={isSelected ? "input settings-source-button resources-list-button resources-list-button-selected" : "input settings-source-button resources-list-button"} style={{ textAlign: "left", opacity: isDragging ? 0.7 : 1 }} onClick={() => setSelectedSourceIdx(idx)} onDragStart={() => { setDraggingSourceIdx(idx); if (idx !== selectedSourceIdx) setSelectedSourceIdx(idx); }} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (draggingSourceIdx != null) moveSource(draggingSourceIdx, idx); setDraggingSourceIdx(null); }} onDragEnd={() => setDraggingSourceIdx(null)}><div className="settings-source-button-inner"><span className="settings-source-handle" aria-hidden="true">⋮⋮</span><div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{source.name || "New Source"}</div><div className="subtle">{source.materials.length} material{source.materials.length === 1 ? "" : "s"}{source.is_active === false ? " • inactive" : ""}</div></div></div></button>;
                    })}
                  </div>
                </div>
                <div className="card resources-panel-card" style={{ padding: 12 }}>
                  {!selectedSource ? <div className="subtle">Select a source to edit it.</div> : <>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><div style={{ fontWeight: 900 }}>Source Details</div><button className="btn btn-ghost resources-inline-action" onClick={() => removeSource(selectedSourceIdx)} disabled={sectionSaving || sources.length === 0}>Remove Source</button></div>
                    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                      <label><div className="label">Source Name</div><input className="input" value={selectedSource.name} onChange={(e) => updateSource(selectedSourceIdx, { name: e.target.value })} /></label>
                      <label style={{ display: "flex", alignItems: "center", gap: 10 }}><input type="checkbox" checked={selectedSource.is_active !== false} onChange={(e) => updateSource(selectedSourceIdx, { is_active: e.target.checked })} /><span className="label" style={{ margin: 0 }}>Active on employee timesheet</span></label>
                    </div>
                    <div className="resources-subsection" style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(0,0,0,.08)" }}>
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><div style={{ fontWeight: 900 }}>Materials</div><button className="btn btn-ghost resources-secondary-btn" onClick={addMaterial} disabled={sectionSaving}>+ Add Material</button></div>
                      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                        {selectedSource.materials.length === 0 && <div className="subtle">No materials yet.</div>}
                        {selectedSource.materials.map((material, matIdx) => <div key={String(material.id || `mat-${matIdx}`)} className="card resources-subitem-card" style={{ padding: 10 }}><div className="settings-material-row resources-subitem-grid"><label><div className="label">Material Name</div><input className="input" value={material.name} onChange={(e) => updateMaterial(matIdx, { name: e.target.value })} /></label><label style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 24 }}><input type="checkbox" checked={material.is_active !== false} onChange={(e) => updateMaterial(matIdx, { is_active: e.target.checked })} /><span className="label" style={{ margin: 0 }}>Active</span></label><button className="btn btn-ghost resources-inline-action" onClick={() => removeMaterial(matIdx)} disabled={sectionSaving || selectedSource.materials.length <= 1} style={{ marginTop: 24 }}>Remove</button></div></div>)}
                      </div>
                    </div>
                  </>}
                </div>
              </div>
            ) : (
              <div className="settings-grid" style={{ marginTop: 14 }}>
                <div className="card resources-panel-card" style={{ padding: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontWeight: 900 }}>Equipment</div><div className="subtle">Drag equipment to change the dropdown order.</div></div><button className="btn btn-ghost resources-secondary-btn" onClick={addEquipment} disabled={sectionSaving}>+ Add Equipment</button></div>
                  <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    {equipmentCatalog.length === 0 && <div className="subtle">No equipment yet.</div>}
                    {equipmentCatalog.map((item, idx) => {
                      const isSelected = idx === selectedEquipmentIdx; const isDragging = idx === draggingEquipmentIdx;
                      return <button key={String(item.id || `equip-${idx}`)} type="button" draggable={!sectionSaving} className={isSelected ? "input settings-source-button resources-list-button resources-list-button-selected" : "input settings-source-button resources-list-button"} style={{ textAlign: "left", opacity: isDragging ? 0.7 : 1 }} onClick={() => setSelectedEquipmentIdx(idx)} onDragStart={() => { setDraggingEquipmentIdx(idx); if (idx !== selectedEquipmentIdx) setSelectedEquipmentIdx(idx); }} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (draggingEquipmentIdx != null) moveEquipment(draggingEquipmentIdx, idx); setDraggingEquipmentIdx(null); }} onDragEnd={() => setDraggingEquipmentIdx(null)}><div className="settings-source-button-inner"><span className="settings-source-handle" aria-hidden="true">⋮⋮</span><div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name || "New Equipment"}</div><div className="subtle">{item.attachments.length} attachment{item.attachments.length === 1 ? "" : "s"}{item.is_active === false ? " • inactive" : ""}</div></div></div></button>;
                    })}
                  </div>
                </div>
                <div className="card resources-panel-card" style={{ padding: 12 }}>
                  {!selectedEquipment ? <div className="subtle">Select equipment to edit it.</div> : <>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><div style={{ fontWeight: 900 }}>Equipment Details</div><button className="btn btn-ghost resources-inline-action" onClick={() => removeEquipment(selectedEquipmentIdx)} disabled={sectionSaving || equipmentCatalog.length === 0}>Remove Equipment</button></div>
                    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                      <label><div className="label">Equipment Name</div><input className="input" value={selectedEquipment.name} onChange={(e) => updateEquipment(selectedEquipmentIdx, { name: e.target.value })} /></label>
                      <div className="resources-equipment-meta-grid">
                        <label><div className="label">Unit Number</div><input className="input" value={selectedEquipment.unit_number || ""} onChange={(e) => updateEquipment(selectedEquipmentIdx, { unit_number: e.target.value })} placeholder="PC210-01" /></label>
                        <label><div className="label">Year</div><input className="input" value={selectedEquipment.equipment_year || ""} onChange={(e) => updateEquipment(selectedEquipmentIdx, { equipment_year: e.target.value })} placeholder="2022" /></label>
                        <label><div className="label">Model</div><input className="input" value={selectedEquipment.model || ""} onChange={(e) => updateEquipment(selectedEquipmentIdx, { model: e.target.value })} placeholder="Komatsu PC210LC" /></label>
                        <label><div className="label">VIN Number</div><input className="input" value={selectedEquipment.vin_number || ""} onChange={(e) => updateEquipment(selectedEquipmentIdx, { vin_number: e.target.value })} placeholder="Serial / VIN" /></label>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 10 }}><input type="checkbox" checked={selectedEquipment.is_active !== false} onChange={(e) => updateEquipment(selectedEquipmentIdx, { is_active: e.target.checked })} /><span className="label" style={{ margin: 0 }}>Active on employee timesheet</span></label>
                    </div>
                    <div className="resources-subsection" style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(0,0,0,.08)" }}>
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><div style={{ fontWeight: 900 }}>Attachments</div><button className="btn btn-ghost resources-secondary-btn" onClick={addAttachment} disabled={sectionSaving}>+ Add Attachment</button></div>
                      <div className="subtle" style={{ marginTop: 6 }}>Leave this list empty if the equipment should not show an attachment dropdown.</div>
                      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                        {selectedEquipment.attachments.length === 0 && <div className="subtle">No attachments yet.</div>}
                        {selectedEquipment.attachments.map((attachment, attIdx) => <div key={String(attachment.id || `att-${attIdx}`)} className="card resources-subitem-card" style={{ padding: 10 }}><div className="settings-material-row resources-subitem-grid"><label><div className="label">Attachment Name</div><input className="input" value={attachment.name} onChange={(e) => updateAttachment(attIdx, { name: e.target.value })} /></label><label style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 24 }}><input type="checkbox" checked={attachment.is_active !== false} onChange={(e) => updateAttachment(attIdx, { is_active: e.target.checked })} /><span className="label" style={{ margin: 0 }}>Active</span></label><button className="btn btn-ghost resources-inline-action" onClick={() => removeAttachment(attIdx)} disabled={sectionSaving} style={{ marginTop: 24 }}>Remove</button></div></div>)}
                      </div>
                    </div>
                  </>}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
