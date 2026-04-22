import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { flattenEquipmentCatalog, legacyEquipmentCatalog, normalizeEquipmentCatalog } from "@/lib/equipmentCatalog";

function isMissingSchemaError(err: any) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const eq = await supabaseServer.from("equipment_catalog").select("id, name, equipment_class_id, unit_number, equipment_year, model, vin_number, is_active, sort_order").order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (eq.error) {
    if (isMissingSchemaError(eq.error)) {
      const fallback = legacyEquipmentCatalog();
      return res.status(200).json({ equipment: fallback, options: flattenEquipmentCatalog(fallback), usingFallback: true, schemaReady: false });
    }
    return res.status(500).json({ error: eq.error.message || "Failed to load equipment" });
  }
  const equipment = eq.data || [];
  const ids = equipment.map((item: any) => item.id).filter(Boolean);
  const attachments = ids.length ? await supabaseServer.from("equipment_attachment_options").select("id, equipment_id, name, is_active, sort_order").in("equipment_id", ids).order("sort_order", { ascending: true }).order("name", { ascending: true }) : ({ data: [], error: null } as any);
  if (attachments.error) {
    if (isMissingSchemaError(attachments.error)) {
      const fallback = legacyEquipmentCatalog();
      return res.status(200).json({ equipment: fallback, options: flattenEquipmentCatalog(fallback), usingFallback: true, schemaReady: false });
    }
    return res.status(500).json({ error: attachments.error.message || "Failed to load equipment attachments" });
  }
  const byEquipment = new Map<any, any[]>();
  for (const attachment of attachments.data || []) {
    const list = byEquipment.get((attachment as any).equipment_id) || [];
    list.push(attachment);
    byEquipment.set((attachment as any).equipment_id, list);
  }
  const catalog = normalizeEquipmentCatalog(equipment.map((item: any) => ({ ...item, attachments: byEquipment.get(item.id) || [] }))).filter((item) => item.is_active !== false);
  if (!catalog.length) {
    const fallback = legacyEquipmentCatalog();
    return res.status(200).json({ equipment: fallback, options: flattenEquipmentCatalog(fallback), usingFallback: true, schemaReady: true });
  }
  return res.status(200).json({ equipment: catalog, options: flattenEquipmentCatalog(catalog), usingFallback: false, schemaReady: true });
}
