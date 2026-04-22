import React from "react";
import { EstimateRecord, EstimateRow, EstimateRowType, asMoney, computeEstimateTotal, computeRowAmount, createBlankEstimateRow } from "../lib/projectPipeline";

type MaterialRateRow = {
  id: number | string;
  name: string;
  source_id: number | string;
  cost_per_tonne: number | string | null;
  markup_percent: number | string | null;
  default_truck_class_id: number | string | null;
};

type EquipmentClassRow = {
  id: number | string;
  name: string;
  type: "truck" | "equipment";
  hourly_rate: number | string | null;
  payload_tonnes: number | string | null;
  active?: boolean;
};

type AttachmentRow = {
  id: number | string;
  name: string;
  equipment_class_id: number | string;
  hourly_rate_addon: number | string | null;
};

type MaterialSource = {
  id?: number | string;
  name: string;
  materials: Array<{ id?: number | string; name: string }>;
};

type EquipmentItem = {
  id?: number | string;
  name: string;
  equipment_class_id?: number | string | null;
};

type RowEntryMode = "custom" | "material" | "equipment";

function rowTypeLabel(type: EstimateRowType) {
  if (type === "header") return "Header";
  if (type === "subtotal") return "Subtotal";
  return "Item";
}

function parseMaterialItemLabel(value: string) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(.+?)\s+-\s+(.+)$/);
  if (!match) return { sourceName: "", materialName: "" };
  return { sourceName: match[1].trim(), materialName: match[2].trim() };
}

function buildMaterialItemLabel(sourceName: string, materialName: string) {
  const source = String(sourceName || "").trim();
  const material = String(materialName || "").trim();
  if (!material) return "";
  return source ? `${source} - ${material}` : material;
}

function inferEntryMode(row: EstimateRow, materialLabels: Set<string>, equipmentLabels: Set<string>): RowEntryMode {
  if (row.type !== "item") return "custom";
  if (row.rowKind === "material" || row.rowKind === "equipment" || row.rowKind === "custom") return row.rowKind;
  const item = String(row.item || "").trim();
  if (row.unit === "load" || materialLabels.has(item)) return "material";
  if (row.unit === "hr" || equipmentLabels.has(item)) return "equipment";
  return "custom";
}

function toNum(value: string | number | null | undefined) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatRate(value: number) {
  return Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, "") : "";
}

function buildCleanRow(row: EstimateRow, patch: Partial<EstimateRow>) {
  const next = { ...row, ...patch };
  if (next.type === "header") {
    return { ...next, description: "", unit: "", quantity: "", rate: "", amount: "", notes: "" };
  }
  if (next.type === "item") {
    return { ...next, description: "", amount: "" };
  }
  return next;
}

export default function ProjectEstimateEditor({
  estimate,
  setEstimate,
  onSave,
  onSaveAndQuote,
  busy,
}: {
  estimate: EstimateRecord;
  setEstimate: React.Dispatch<React.SetStateAction<EstimateRecord>>;
  onSave: () => void;
  onSaveAndQuote: () => void;
  busy?: boolean;
}) {
  const total = computeEstimateTotal(estimate.rows || []);
  const [materialSources, setMaterialSources] = React.useState<MaterialSource[]>([]);
  const [materialRates, setMaterialRates] = React.useState<MaterialRateRow[]>([]);
  const [equipmentClasses, setEquipmentClasses] = React.useState<EquipmentClassRow[]>([]);
  const [attachments, setAttachments] = React.useState<AttachmentRow[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadCatalogs() {
      try {
        const adminPw = typeof window !== "undefined" ? window.localStorage.getItem("pcc_admin_pw") || "" : "";
        const [materialsRes, ratesRes] = await Promise.all([
          fetch("/api/material-catalog"),
          adminPw
            ? fetch("/api/admin/rates", { headers: { "x-admin-password": adminPw } })
            : Promise.resolve(null),
        ]);
        if (!cancelled && materialsRes.ok) {
          const materialsJson = await materialsRes.json();
          setMaterialSources(Array.isArray(materialsJson.sources) ? materialsJson.sources : []);
        }
        if (!cancelled && ratesRes && ratesRes.ok) {
          const ratesJson = await ratesRes.json();
          setMaterialRates(Array.isArray(ratesJson.material_rows) ? ratesJson.material_rows : []);
          setEquipmentClasses(Array.isArray(ratesJson.equipment_classes) ? ratesJson.equipment_classes : []);
          setAttachments(Array.isArray(ratesJson.attachments) ? ratesJson.attachments : []);
        }
      } catch {
        if (!cancelled) {
          setMaterialSources([]);
          setMaterialRates([]);
          setEquipmentClasses([]);
          setAttachments([]);
        }
      }
    }
    loadCatalogs();
    return () => {
      cancelled = true;
    };
  }, []);

  const materialLabelSet = React.useMemo(() => {
    const out = new Set<string>();
    for (const source of materialSources) {
      for (const material of source.materials || []) {
        out.add(buildMaterialItemLabel(source.name, material.name));
      }
    }
    return out;
  }, [materialSources]);

  const equipmentLabelSet = React.useMemo(() => new Set(equipmentClasses.map((item) => String(item.name || "").trim()).filter(Boolean)), [equipmentClasses]);

  const materialRowById = React.useMemo(() => {
    const out = new Map<string, MaterialRateRow>();
    for (const row of materialRates) {
      const key = String(row?.id || "").trim();
      if (!key) continue;
      out.set(key, row);
    }
    return out;
  }, [materialRates]);

  const equipmentClassById = React.useMemo(() => {
    const out = new Map<string, string>();
    for (const row of equipmentClasses) {
      const key = String(row?.id || "").trim();
      if (!key) continue;
      const value = row?.hourly_rate;
      out.set(key, value === null || value === undefined || value === "" ? "" : String(value));
    }
    return out;
  }, [equipmentClasses]);

  const attachmentById = React.useMemo(() => {
    const out = new Map<string, AttachmentRow>();
    for (const row of attachments) out.set(String(row.id), row);
    return out;
  }, [attachments]);

  function getEquipmentRateForClass(classId?: string) {
    if (!classId) return "";
    return equipmentClassById.get(classId) || "";
  }

  function getMaterialLoadPrice(materialId?: string, cycleOverride?: string) {
    if (!materialId) return "";
    const row = materialRowById.get(materialId);
    if (!row) return "";
    const truckClass = equipmentClasses.find((item) => String(item.id) === String(row.default_truck_class_id));
    const payload = toNum(truckClass?.payload_tonnes);
    const truckRate = toNum(truckClass?.hourly_rate);
    const costPerTonne = toNum(row.cost_per_tonne);
    const markup = toNum(row.markup_percent);
    const cycle = String(cycleOverride || "").trim() ? Math.max(toNum(cycleOverride), 0) : 1.0;
    const materialCost = payload * costPerTonne;
    const truckingCost = truckRate * cycle;
    const subtotal = materialCost + truckingCost;
    const load = subtotal * (1 + (markup / 100));
    return formatRate(load);
  }

  React.useEffect(() => {
    if (!estimate.rows?.length) return;
    if (!materialSources.length && !equipmentClasses.length) return;
    let changed = false;
    const nextRows = estimate.rows.map((row) => {
      if (row.type !== "item") return row;
      const mode = inferEntryMode(row, materialLabelSet, equipmentLabelSet);
      if (mode === "material") {
        const rate = getMaterialLoadPrice(row.materialId, row.cycleTimeHours);
        if (String(row.rate || "") === String(rate || "")) return row;
        changed = true;
        return { ...row, rate };
      }
      if (mode === "equipment") {
        const matchingClass = equipmentClasses.find((item) => String(item.name || "").trim() === String(row.item || "").trim());
        const classId = String(row.equipmentClassId || matchingClass?.id || "");
        const baseRate = toNum(getEquipmentRateForClass(classId));
        const addonRate = toNum(attachmentById.get(String(row.attachmentId || ""))?.hourly_rate_addon);
        const rate = formatRate(baseRate + addonRate);
        if (String(row.rate || "") === String(rate || "") && String(row.equipmentClassId || "") === classId) return row;
        changed = true;
        return { ...row, equipmentClassId: classId, item: matchingClass?.name || row.item, rate };
      }
      return row;
    });
    if (changed) setEstimate((prev) => ({ ...prev, rows: nextRows }));
  }, [estimate.rows, materialSources, materialLabelSet, equipmentLabelSet, materialRowById, equipmentClassById, equipmentClasses, attachmentById, setEstimate]);

  function updateField<K extends keyof EstimateRecord>(key: K, value: EstimateRecord[K]) {
    setEstimate((prev) => ({ ...prev, [key]: value }));
  }

  function updateRow(rowId: string, patch: Partial<EstimateRow>) {
    setEstimate((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.id === rowId ? buildCleanRow(row, patch) : row)),
    }));
  }

  function switchItemMode(row: EstimateRow, mode: RowEntryMode) {
    if (mode === "material") {
      const firstSource = materialSources[0];
      const firstMaterial = firstSource?.materials?.[0];
      updateRow(row.id, {
        item: firstMaterial ? buildMaterialItemLabel(firstSource.name, firstMaterial.name) : "",
        rowKind: "material",
        unit: "load",
        materialId: firstMaterial?.id ? String(firstMaterial.id) : "",
        cycleTimeHours: "",
        rate: firstMaterial?.id ? getMaterialLoadPrice(String(firstMaterial.id), "") : "",
        notes: "",
      });
      return;
    }
    if (mode === "equipment") {
      const firstClass = equipmentClasses.find((item) => item.type === "equipment" && String(item.name || "").trim()) || equipmentClasses[0];
      const classId = firstClass?.id ? String(firstClass.id) : "";
      updateRow(row.id, {
        item: firstClass?.name || "",
        rowKind: "equipment",
        unit: "hr",
        equipmentUnitId: "",
        equipmentClassId: classId,
        attachmentId: "",
        rate: classId ? getEquipmentRateForClass(classId) : "",
        notes: "",
      });
      return;
    }
    updateRow(row.id, { rowKind: "custom", item: "", unit: "", rate: "", notes: "", equipmentUnitId: "", equipmentClassId: "", attachmentId: "", materialId: "", cycleTimeHours: "" });
  }

  function addRow(type: EstimateRowType) {
    setEstimate((prev) => ({ ...prev, rows: [...prev.rows, createBlankEstimateRow(type)] }));
  }

  function removeRow(rowId: string) {
    setEstimate((prev) => ({ ...prev, rows: prev.rows.filter((row) => row.id !== rowId) }));
  }

  return (
    <>
      <div className="project-two-col">
        <div className="project-card-surface">
          <div className="project-section-title">Estimate Header</div>
          <div className="project-form-grid">
            <label><div className="label">Quote Number</div><input className="input" value={estimate.quoteNumber || ""} onChange={(e) => updateField("quoteNumber", e.target.value)} /></label>
            <label><div className="label">Revision</div><input className="input" value={estimate.revision || ""} onChange={(e) => updateField("revision", e.target.value)} /></label>
            <label><div className="label">Project Name</div><input className="input" value={estimate.projectName || ""} onChange={(e) => updateField("projectName", e.target.value)} /></label>
            <label><div className="label">Client</div><input className="input" value={estimate.clientName || ""} onChange={(e) => updateField("clientName", e.target.value)} /></label>
            <label><div className="label">Project Location</div><input className="input" value={estimate.projectLocation || ""} onChange={(e) => updateField("projectLocation", e.target.value)} /></label>
            <label><div className="label">Estimator</div><input className="input" value={estimate.estimator || ""} onChange={(e) => updateField("estimator", e.target.value)} /></label>
            <label><div className="label">Estimate Date</div><input type="date" className="input" value={estimate.estimateDate || ""} onChange={(e) => updateField("estimateDate", e.target.value)} /></label>
            <label><div className="label">Expected Start</div><input type="date" className="input" value={estimate.expectedStart || ""} onChange={(e) => updateField("expectedStart", e.target.value)} /></label>
            <label><div className="label">Expected Duration</div><input className="input" placeholder="e.g. 4 weeks" value={estimate.expectedDuration || ""} onChange={(e) => updateField("expectedDuration", e.target.value)} /></label>
            <label><div className="label">Truck Cycle Time (hrs/load)</div><input className="input" inputMode="decimal" placeholder="1.0" value={estimate.truckCycleTimeHours || ""} onChange={(e) => updateField("truckCycleTimeHours", e.target.value)} /></label>
          </div>
          <div className="project-form-grid project-form-grid-single" style={{ marginTop: 12 }}>
            <label><div className="label">Estimate Notes / Assumptions</div><textarea className="input" rows={4} value={estimate.notes || ""} onChange={(e) => updateField("notes", e.target.value)} /></label>
          </div>
          <div className="subtle" style={{ marginTop: 10 }}>Leave truck cycle blank to assume 1.0 hour per tandem load. Material rates adjust automatically from the base trucking built into each material.</div>
          <div className="project-card-surface project-summary-card" style={{ marginTop: 16, padding: 16 }}>
            <div className="project-summary-topline">
              <div>
                <div className="project-section-title" style={{ marginBottom: 6 }}>Estimate Summary</div>
                <div className="subtle">Headers are now full-width section breaks. Item rows are simplified and can pull from your material and equipment catalogs.</div>
              </div>
              <div className="project-summary-total">{asMoney(total)}</div>
            </div>
            <div className="project-summary-stats" style={{ marginTop: 14 }}>
              <div className="project-stat"><span>Rows</span><strong>{estimate.rows.length}</strong></div>
              <div className="project-stat"><span>Status</span><strong>{estimate.status === "quoted" ? "Quoted" : "Draft"}</strong></div>
              <div className="project-stat"><span>Cycle</span><strong>{estimate.truckCycleTimeHours || "1.0"} hr/load</strong></div>
            </div>
          </div>
          <div className="row" style={{ gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" onClick={onSave} disabled={busy}>{busy ? "Saving…" : "Save Draft"}</button>
            <button className="btn" onClick={onSaveAndQuote} disabled={busy}>{estimate.status === "quoted" ? "Update Quote" : "Push to Quotes"}</button>
          </div>
        </div>
      </div>

      <div className="project-card-surface" style={{ marginTop: 18 }}>
        <div className="project-section-title">Estimate Grid</div>
        <div className="subtle" style={{ marginBottom: 10 }}>Header rows run full width. Item rows are cleaner and pull from dropdowns when you want materials or equipment.</div>
        <div className="project-grid-wrap">
          <table className="project-grid-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Entry</th>
                <th>Item</th>
                <th style={{ width: 90 }}>Unit</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Amount</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {estimate.rows.map((row) => {
                const amount = computeRowAmount(row);
                const rowClass = row.type === "header" ? "project-grid-row project-grid-row-header" : row.type === "subtotal" ? "project-grid-row project-grid-row-subtotal" : "project-grid-row";
                const entryMode = inferEntryMode(row, materialLabelSet, equipmentLabelSet);
                const parsedMaterial = parseMaterialItemLabel(row.item);
                const selectedSource = materialSources.find((source) => source.name === parsedMaterial.sourceName) || materialSources[0];
                const materialOptions = selectedSource?.materials || [];
                const selectedClassId = String(row.equipmentClassId || "");
                const compatibleAttachments = attachments.filter((att) => String(att.equipment_class_id) === selectedClassId && String(att.name || "").trim());

                if (row.type === "header") {
                  return (
                    <tr key={row.id} className={rowClass}>
                      <td>
                        <select className="input" value={row.type} onChange={(e) => updateRow(row.id, { type: e.target.value as EstimateRowType })}>
                          <option value="item">{rowTypeLabel("item")}</option>
                          <option value="header">{rowTypeLabel("header")}</option>
                          <option value="subtotal">{rowTypeLabel("subtotal")}</option>
                        </select>
                      </td>
                      <td colSpan={7}>
                        <input className="input" placeholder="Section header" value={row.item} onChange={(e) => updateRow(row.id, { item: e.target.value })} />
                      </td>
                      <td><button className="btn btn-ghost" onClick={() => removeRow(row.id)}>Remove</button></td>
                    </tr>
                  );
                }

                if (row.type === "subtotal") {
                  return (
                    <tr key={row.id} className={rowClass}>
                      <td>
                        <select className="input" value={row.type} onChange={(e) => updateRow(row.id, { type: e.target.value as EstimateRowType })}>
                          <option value="item">{rowTypeLabel("item")}</option>
                          <option value="header">{rowTypeLabel("header")}</option>
                          <option value="subtotal">{rowTypeLabel("subtotal")}</option>
                        </select>
                      </td>
                      <td>
                        <div className="subtle" style={{ fontWeight: 700 }}>Subtotal</div>
                      </td>
                      <td><input className="input" value={row.item} onChange={(e) => updateRow(row.id, { item: e.target.value })} /></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td><input className="input" inputMode="decimal" value={row.amount} onChange={(e) => updateRow(row.id, { amount: e.target.value })} /></td>
                      <td><input className="input" value={row.notes} onChange={(e) => updateRow(row.id, { notes: e.target.value })} /></td>
                      <td><button className="btn btn-ghost" onClick={() => removeRow(row.id)}>Remove</button></td>
                    </tr>
                  );
                }

                return (
                  <tr key={row.id} className={rowClass}>
                    <td>
                      <select className="input" value={row.type} onChange={(e) => updateRow(row.id, { type: e.target.value as EstimateRowType })}>
                        <option value="item">{rowTypeLabel("item")}</option>
                        <option value="header">{rowTypeLabel("header")}</option>
                        <option value="subtotal">{rowTypeLabel("subtotal")}</option>
                      </select>
                    </td>
                    <td>
                      <select className="input project-select-compact" value={entryMode} onChange={(e) => switchItemMode(row, e.target.value as RowEntryMode)} title={entryMode === "custom" ? "Custom" : entryMode === "material" ? "Material" : "Equipment"}>
                        <option value="custom">Custom</option>
                        <option value="material">Material</option>
                        <option value="equipment">Equipment</option>
                      </select>
                    </td>
                    <td>
                      {entryMode === "material" ? (
                        <div style={{ display: "grid", gap: 8 }}>
                          <select
                            className="input project-select-compact"
                            value={selectedSource?.name || ""}
                            title={selectedSource?.name || ""}
                            onChange={(e) => {
                              const source = materialSources.find((item) => item.name === e.target.value);
                              const material = source?.materials?.[0];
                              updateRow(row.id, { item: material ? buildMaterialItemLabel(source?.name || "", material.name) : "", materialId: material?.id ? String(material.id) : "", unit: "load", rate: material?.id ? getMaterialLoadPrice(String(material.id), row.cycleTimeHours) : "" });
                            }}
                          >
                            {materialSources.map((source) => <option key={String(source.id || source.name)} value={source.name} title={source.name}>{source.name}</option>)}
                          </select>
                          <select
                            className="input project-select-compact"
                            value={parsedMaterial.materialName || ""}
                            title={parsedMaterial.materialName || ""}
                            onChange={(e) => {
                              const picked = materialOptions.find((m) => m.name === e.target.value);
                              updateRow(row.id, { item: buildMaterialItemLabel(selectedSource?.name || "", e.target.value), materialId: picked?.id ? String(picked.id) : "", unit: "load", rate: picked?.id ? getMaterialLoadPrice(String(picked.id), row.cycleTimeHours) : "" });
                            }}
                          >
                            {materialOptions.map((material) => <option key={String(material.id || material.name)} value={material.name} title={material.name}>{material.name}</option>)}
                          </select>
                        </div>
                      ) : entryMode === "equipment" ? (
                        <div style={{ display: "grid", gap: 8 }}>
                        <select className="input project-select-compact" value={selectedClassId} title={row.item || ""} onChange={(e) => {
                          const cls = equipmentClasses.find((it) => String(it.id) === e.target.value);
                          const classId = cls?.id ? String(cls.id) : "";
                          updateRow(row.id, { equipmentUnitId: "", equipmentClassId: classId, attachmentId: "", item: cls?.name || "", unit: "hr", rate: getEquipmentRateForClass(classId) });
                        }}>
                          <option value="">Select class</option>
                          {equipmentClasses.filter((item) => String(item.name || "").trim() && item.active !== false).map((item) => <option key={String(item.id)} value={String(item.id)} title={item.name}>{item.name}</option>)}
                        </select>
                        <select className="input project-select-compact" value={String(row.attachmentId || "")} onChange={(e) => {
                          const nextAttachment = attachmentById.get(String(e.target.value));
                          const base = toNum(getEquipmentRateForClass(selectedClassId));
                          const addon = toNum(nextAttachment?.hourly_rate_addon);
                          updateRow(row.id, { attachmentId: e.target.value, rate: formatRate(base + addon) });
                        }}>
                          <option value="">No attachment</option>
                          {compatibleAttachments.map((att) => <option key={String(att.id)} value={String(att.id)}>{att.name}</option>)}
                        </select>
                        </div>
                      ) : (
                        <input className="input" value={row.item} onChange={(e) => updateRow(row.id, { item: e.target.value })} />
                      )}
                    </td>
                    <td>
                      {entryMode === "material" || entryMode === "equipment" ? (
                        <input className="input project-unit-select" value={entryMode === "material" ? "load" : "hr"} disabled />
                      ) : (
                        <select className="input project-unit-select" value={row.unit} onChange={(e) => updateRow(row.id, { unit: e.target.value })}>
                          <option value=""></option>
                          <option value="hr">hr</option>
                          <option value="load">load</option>
                          <option value="ea">ea</option>
                          <option value="ls">ls</option>
                          <option value="day">day</option>
                        </select>
                      )}
                    </td>
                    <td>
                      {entryMode === "material" ? (
                        <div style={{ display: "grid", gap: 6 }}>
                          <input className="input" inputMode="decimal" placeholder="Loads" value={row.quantity} onChange={(e) => updateRow(row.id, { quantity: e.target.value })} />
                          <input className="input" inputMode="decimal" placeholder="Cycle hrs (1.0)" value={row.cycleTimeHours || ""} onChange={(e) => updateRow(row.id, { cycleTimeHours: e.target.value, rate: getMaterialLoadPrice(row.materialId, e.target.value) })} />
                        </div>
                      ) : (
                        <input className="input" inputMode="decimal" value={row.quantity} onChange={(e) => updateRow(row.id, { quantity: e.target.value })} />
                      )}
                    </td>
                    <td><input className="input" inputMode="decimal" value={row.rate} onChange={(e) => updateRow(row.id, { rate: e.target.value })} /></td>
                    <td><input className="input" inputMode="decimal" value={String(amount || "")} disabled /></td>
                    <td><input className="input" value={row.notes} onChange={(e) => updateRow(row.id, { notes: e.target.value })} /></td>
                    <td><button className="btn btn-ghost" onClick={() => removeRow(row.id)}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} style={{ textAlign: "right", fontWeight: 900 }}>Total</td>
                <td style={{ fontWeight: 900 }}>{asMoney(total)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="row" style={{ gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button className="btn btn-ghost" onClick={() => addRow("item")}>Add Item</button>
        <button className="btn btn-ghost" onClick={() => addRow("header")}>Add Header</button>
        <button className="btn btn-ghost" onClick={() => addRow("subtotal")}>Add Subtotal</button>
      </div>
    </>
  );
}
