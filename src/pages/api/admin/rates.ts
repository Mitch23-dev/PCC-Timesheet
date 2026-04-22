import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { normalizeEquipmentCatalog } from "@/lib/equipmentCatalog";
import { normalizeMaterialCatalog } from "@/lib/materialCatalog";

function isMissingSchemaError(err: any) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
}

async function loadEquipmentCatalog() {
  const eq = await supabaseServer
    .from("equipment_catalog")
    .select("id, name, unit_number, equipment_year, model, vin_number, is_active, sort_order, equipment_class_id")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (eq.error) return { error: eq.error, equipment: [] as any[] };
  const ids = (eq.data || []).map((item: any) => item.id).filter(Boolean);
  const attachments = ids.length
    ? await supabaseServer
        .from("equipment_attachment_options")
        .select("id, equipment_id, name, is_active, sort_order")
        .in("equipment_id", ids)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
    : ({ data: [], error: null } as any);
  if (attachments.error) return { error: attachments.error, equipment: [] as any[] };
  const byEquipment = new Map<any, any[]>();
  for (const attachment of attachments.data || []) {
    const list = byEquipment.get((attachment as any).equipment_id) || [];
    list.push(attachment);
    byEquipment.set((attachment as any).equipment_id, list);
  }
  return {
    error: null,
    equipment: normalizeEquipmentCatalog((eq.data || []).map((item: any) => ({ ...item, attachments: byEquipment.get(item.id) || [] }))),
  };
}

async function loadMaterialCatalog() {
  const src = await supabaseServer
    .from("material_sources")
    .select("id, name, is_active, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (src.error) return { error: src.error, sources: [] as any[] };
  const sourceIds = (src.data || []).map((s: any) => s.id).filter(Boolean);
  const mats = sourceIds.length
    ? await supabaseServer
        .from("source_materials")
        .select("id, source_id, name, is_active, sort_order")
        .in("source_id", sourceIds)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
    : ({ data: [], error: null } as any);
  if (mats.error) return { error: mats.error, sources: [] as any[] };
  const bySource = new Map<any, any[]>();
  for (const m of mats.data || []) {
    const list = bySource.get((m as any).source_id) || [];
    list.push(m);
    bySource.set((m as any).source_id, list);
  }
  return {
    error: null,
    sources: normalizeMaterialCatalog((src.data || []).map((s: any) => ({ ...s, materials: bySource.get(s.id) || [] }))),
  };
}

async function loadRates() {
  const [classes, attachments, materials] = await Promise.all([
    supabaseServer.from("equipment_classes").select("id, name, type, hourly_rate, payload_tonnes, active, updated_at").order("name", { ascending: true }),
    supabaseServer.from("attachments").select("id, equipment_class_id, name, hourly_rate_addon, active, updated_at").order("name", { ascending: true }),
    supabaseServer
      .from("source_materials")
      .select("id, source_id, name, is_active, sort_order, cost_per_tonne, markup_percent, default_truck_class_id, updated_at")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);
  if (classes.error) return { error: classes.error, rates: null as any };
  if (attachments.error) return { error: attachments.error, rates: null as any };
  if (materials.error) return { error: materials.error, rates: null as any };
  return {
    error: null,
    rates: {
      equipment_classes: classes.data || [],
      attachments: attachments.data || [],
      material_rows: materials.data || [],
    },
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  if (req.method === "GET") {
    const [equipment, materials, rates] = await Promise.all([loadEquipmentCatalog(), loadMaterialCatalog(), loadRates()]);
    const firstError = equipment.error || materials.error || rates.error;
    if (firstError) {
      if (isMissingSchemaError(firstError)) {
        return res.status(200).json({
          equipment: equipment.equipment || [],
          sources: materials.sources || [],
          equipment_classes: [],
          attachments: [],
          material_rows: [],
          schemaReady: false,
          error: "Rates tables are not in the database yet. Run the latest SQL migration to enable admin-managed rates.",
        });
      }
      return res.status(500).json({ error: firstError.message || "Failed to load rates" });
    }
    return res.status(200).json({
      equipment: equipment.equipment || [],
      sources: materials.sources || [],
      equipment_classes: rates.rates?.equipment_classes || [],
      attachments: rates.rates?.attachments || [],
      material_rows: rates.rates?.material_rows || [],
      schemaReady: true,
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const equipmentClasses = Array.isArray(req.body?.equipment_classes) ? req.body.equipment_classes : [];
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
  const materialRows = Array.isArray(req.body?.material_rows) ? req.body.material_rows : [];
  const equipmentAssignments = Array.isArray(req.body?.equipment_assignments) ? req.body.equipment_assignments : [];

  const normalizeNum = (value: any) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  for (const row of equipmentClasses) {
    if (!row?.name) continue;
    const payload = {
      name: String(row.name),
      type: row.type === "truck" ? "truck" : "equipment",
      hourly_rate: normalizeNum(row.hourly_rate) ?? 0,
      payload_tonnes: normalizeNum(row.payload_tonnes),
      active: row.active !== false,
      updated_at: new Date().toISOString(),
    };
    if (row?.id) {
      const { error } = await supabaseServer.from("equipment_classes").upsert({ ...payload, id: Number(row.id) }, { onConflict: "id" });
      if (error) return res.status(500).json({ error: error.message || "Failed to save equipment class" });
    } else {
      const { error } = await supabaseServer.from("equipment_classes").insert(payload);
      if (error) return res.status(500).json({ error: error.message || "Failed to create equipment class" });
    }
  }
  for (const row of attachments) {
    if (!row?.equipment_class_id || !row?.name) continue;
    const payload = {
      equipment_class_id: Number(row.equipment_class_id),
      name: String(row.name),
      hourly_rate_addon: normalizeNum(row.hourly_rate_addon) ?? 0,
      active: row.active !== false,
      updated_at: new Date().toISOString(),
    };
    if (row?.id) {
      const { error } = await supabaseServer.from("attachments").upsert({ ...payload, id: Number(row.id) }, { onConflict: "id" });
      if (error) return res.status(500).json({ error: error.message || "Failed to save attachment" });
    } else {
      const { error } = await supabaseServer.from("attachments").insert(payload);
      if (error) return res.status(500).json({ error: error.message || "Failed to create attachment" });
    }
  }
  for (const row of materialRows) {
    if (!row?.id) continue;
    const payload = {
      id: Number(row.id),
      cost_per_tonne: normalizeNum(row.cost_per_tonne),
      markup_percent: normalizeNum(row.markup_percent),
      default_truck_class_id: normalizeNum(row.default_truck_class_id),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseServer.from("source_materials").update(payload).eq("id", Number(row.id));
    if (error) return res.status(500).json({ error: error.message || "Failed to save material row" });
  }
  for (const row of equipmentAssignments) {
    if (!row?.equipment_id) continue;
    const payload = {
      equipment_class_id: normalizeNum(row.equipment_class_id),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseServer.from("equipment_catalog").update(payload).eq("id", Number(row.equipment_id));
    if (error) return res.status(500).json({ error: error.message || "Failed to save equipment assignment" });
  }

  const refreshed = await loadRates();
  if (refreshed.error) return res.status(500).json({ error: refreshed.error.message || "Saved, but failed to reload rates" });
  return res.status(200).json({ ok: true, ...(refreshed.rates || {}) });
}
