import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { legacyEquipmentCatalog, normalizeEquipmentCatalog } from "@/lib/equipmentCatalog";

function isMissingSchemaError(err: any) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
}

async function loadCatalog() {
  const eq = await supabaseServer.from("equipment_catalog").select("id, name, equipment_class_id, unit_number, equipment_year, model, vin_number, is_active, sort_order").order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (eq.error) return { error: eq.error, equipment: null as any };
  const ids = (eq.data || []).map((item: any) => item.id).filter(Boolean);
  const attachments = ids.length ? await supabaseServer.from("equipment_attachment_options").select("id, equipment_id, name, is_active, sort_order").in("equipment_id", ids).order("sort_order", { ascending: true }).order("name", { ascending: true }) : ({ data: [], error: null } as any);
  if (attachments.error) return { error: attachments.error, equipment: null as any };
  const byEquipment = new Map<any, any[]>();
  for (const attachment of attachments.data || []) {
    const list = byEquipment.get((attachment as any).equipment_id) || [];
    list.push(attachment);
    byEquipment.set((attachment as any).equipment_id, list);
  }
  return { error: null, equipment: normalizeEquipmentCatalog((eq.data || []).map((item: any) => ({ ...item, attachments: byEquipment.get(item.id) || [] }))) };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });
  if (req.method === "GET") {
    const loaded = await loadCatalog();
    if (loaded.error) {
      if (isMissingSchemaError(loaded.error)) {
        return res.status(200).json({ equipment: legacyEquipmentCatalog(), usingFallback: true, schemaReady: false, error: "Equipment catalog tables are not in the database yet. Run the latest SQL migration to enable admin-managed equipment and attachments." });
      }
      return res.status(500).json({ error: loaded.error.message || "Failed to load equipment catalog" });
    }
    return res.status(200).json({ equipment: loaded.equipment || [], usingFallback: false, schemaReady: true });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const incoming = normalizeEquipmentCatalog(Array.isArray(req.body?.equipment) ? req.body.equipment : []);
  if (!incoming.length) return res.status(400).json({ error: "At least one equipment item is required" });
  for (const item of incoming) {
    if (!item.name.trim()) return res.status(400).json({ error: "Equipment name is required" });
    for (const attachment of item.attachments) {
      if (!attachment.name.trim()) return res.status(400).json({ error: `All attachments under \"${item.name}\" need a name` });
    }
  }
  const existing = await loadCatalog();
  if (existing.error) {
    if (isMissingSchemaError(existing.error)) return res.status(400).json({ error: "Equipment catalog tables are not in the database yet. Run the latest SQL migration first." });
    return res.status(500).json({ error: existing.error.message || "Failed to load current equipment catalog" });
  }
  const existingEquipment = existing.equipment || [];
  const existingEquipmentIds = new Set<string>(existingEquipment.map((item: any) => String(item.id)));
  const keptEquipmentIds = new Set<string>();
  for (let idx = 0; idx < incoming.length; idx++) {
    const item = incoming[idx];
    const payload = { name: item.name.trim(), equipment_class_id: item.equipment_class_id ? Number(item.equipment_class_id) : null, unit_number: String(item.unit_number || '').trim() || null, equipment_year: String(item.equipment_year || '').trim() || null, model: String(item.model || '').trim() || null, vin_number: String(item.vin_number || '').trim() || null, is_active: item.is_active !== false, sort_order: idx + 1 };
    let equipmentId = item.id ? String(item.id) : "";
    if (equipmentId) {
      keptEquipmentIds.add(equipmentId);
      const { error: upErr } = await supabaseServer.from("equipment_catalog").update(payload).eq("id", equipmentId);
      if (upErr) return res.status(500).json({ error: upErr.message || `Failed to update equipment ${item.name}` });
    } else {
      const { data: inserted, error: insErr } = await supabaseServer.from("equipment_catalog").insert(payload).select("id").single();
      if (insErr || !inserted?.id) return res.status(500).json({ error: insErr?.message || `Failed to create equipment ${item.name}` });
      equipmentId = String(inserted.id);
      keptEquipmentIds.add(equipmentId);
    }
    const existingAttachments = existingEquipment.find((x: any) => String(x.id) === String(item.id))?.attachments || [];
    const existingAttachmentIds = new Set<string>(existingAttachments.map((attachment: any) => String(attachment.id)));
    const keptAttachmentIds = new Set<string>();
    for (let aIdx = 0; aIdx < item.attachments.length; aIdx++) {
      const attachment = item.attachments[aIdx];
      const payload2 = { equipment_id: Number(equipmentId), name: attachment.name.trim(), is_active: attachment.is_active !== false, sort_order: aIdx + 1 };
      const attachmentId = attachment.id ? String(attachment.id) : "";
      if (attachmentId) {
        keptAttachmentIds.add(attachmentId);
        const { error: upErr } = await supabaseServer.from("equipment_attachment_options").update(payload2).eq("id", attachmentId);
        if (upErr) return res.status(500).json({ error: upErr.message || `Failed to update attachment ${attachment.name}` });
      } else {
        const { data: inserted, error: insErr } = await supabaseServer.from("equipment_attachment_options").insert(payload2).select("id").single();
        if (insErr || !inserted?.id) return res.status(500).json({ error: insErr?.message || `Failed to create attachment ${attachment.name}` });
        keptAttachmentIds.add(String(inserted.id));
      }
    }
    const deleteAttachmentIds = Array.from(existingAttachmentIds).filter((id) => !keptAttachmentIds.has(id));
    if (deleteAttachmentIds.length) {
      const { error: delErr } = await supabaseServer.from("equipment_attachment_options").delete().in("id", deleteAttachmentIds.map((id) => Number(id)));
      if (delErr) return res.status(500).json({ error: delErr.message || `Failed to delete removed attachments for ${item.name}` });
    }
  }
  const deleteEquipmentIds = Array.from(existingEquipmentIds).filter((id) => !keptEquipmentIds.has(id));
  if (deleteEquipmentIds.length) {
    const nums = deleteEquipmentIds.map((id) => Number(id)).filter((n) => Number.isFinite(n));
    if (nums.length) {
      const { error: delAttErr } = await supabaseServer.from("equipment_attachment_options").delete().in("equipment_id", nums);
      if (delAttErr) return res.status(500).json({ error: delAttErr.message || "Failed to delete removed equipment attachments" });
      const { error: delEqErr } = await supabaseServer.from("equipment_catalog").delete().in("id", nums);
      if (delEqErr) return res.status(500).json({ error: delEqErr.message || "Failed to delete removed equipment" });
    }
  }
  const refreshed = await loadCatalog();
  if (refreshed.error) return res.status(500).json({ error: refreshed.error.message || "Saved, but failed to reload equipment catalog" });
  return res.status(200).json({ ok: true, equipment: refreshed.equipment || [] });
}
