import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { legacyMaterialCatalog, normalizeMaterialCatalog } from "@/lib/materialCatalog";

function isMissingSchemaError(err: any) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
}

async function loadCatalog() {
  const src = await supabaseServer
    .from("material_sources")
    .select("id, name, is_active, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (src.error) return { error: src.error, sources: null as any };

  const sourceIds = (src.data || []).map((s: any) => s.id).filter(Boolean);
  const mats = sourceIds.length
    ? await supabaseServer
        .from("source_materials")
        .select("id, source_id, name, is_active, sort_order")
        .in("source_id", sourceIds)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
    : { data: [], error: null } as any;

  if (mats.error) return { error: mats.error, sources: null as any };

  const bySource = new Map<any, any[]>();
  for (const m of mats.data || []) {
    const list = bySource.get((m as any).source_id) || [];
    list.push(m);
    bySource.set((m as any).source_id, list);
  }

  const catalog = normalizeMaterialCatalog(
    (src.data || []).map((s: any) => ({
      ...s,
      materials: bySource.get(s.id) || [],
    }))
  );

  return { error: null, sources: catalog };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  if (req.method === "GET") {
    const loaded = await loadCatalog();
    if (loaded.error) {
      if (isMissingSchemaError(loaded.error)) {
        return res.status(200).json({
          sources: legacyMaterialCatalog(),
          usingFallback: true,
          schemaReady: false,
          error: "Material catalog tables are not in the database yet. Run the latest SQL migration to enable admin-managed sources and materials.",
        });
      }
      return res.status(500).json({ error: loaded.error.message || "Failed to load material catalog" });
    }

    return res.status(200).json({
      sources: loaded.sources || [],
      usingFallback: false,
      schemaReady: true,
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const incoming = normalizeMaterialCatalog(Array.isArray(req.body?.sources) ? req.body.sources : []);
  if (!incoming.length) return res.status(400).json({ error: "At least one source is required" });

  for (const source of incoming) {
    if (!source.name.trim()) return res.status(400).json({ error: "Source name is required" });
    if (!source.materials.length) return res.status(400).json({ error: `Source \"${source.name}\" must have at least one material` });
    for (const material of source.materials) {
      if (!material.name.trim()) return res.status(400).json({ error: `All materials under \"${source.name}\" need a name` });
    }
  }

  const existing = await loadCatalog();
  if (existing.error) {
    if (isMissingSchemaError(existing.error)) {
      return res.status(400).json({ error: "Material catalog tables are not in the database yet. Run the latest SQL migration first." });
    }
    return res.status(500).json({ error: existing.error.message || "Failed to load current catalog" });
  }

  const existingSources = existing.sources || [];
  const existingSourceIds = new Set<string>(existingSources.map((s: any) => String(s.id)));

  const keptSourceIds = new Set<string>();

  for (let i = 0; i < incoming.length; i++) {
    const source = incoming[i];
    const payload = {
      name: source.name.trim(),
      is_active: source.is_active !== false,
      sort_order: i + 1,
    };

    let sourceId = source.id ? String(source.id) : "";

    if (sourceId) {
      keptSourceIds.add(sourceId);
      const { error: upErr } = await supabaseServer.from("material_sources").update(payload).eq("id", sourceId);
      if (upErr) return res.status(500).json({ error: upErr.message || `Failed to update source ${source.name}` });
    } else {
      const { data: inserted, error: insErr } = await supabaseServer.from("material_sources").insert(payload).select("id").single();
      if (insErr || !inserted?.id) return res.status(500).json({ error: insErr?.message || `Failed to create source ${source.name}` });
      sourceId = String(inserted.id);
      keptSourceIds.add(sourceId);
    }

    const existingMaterials = existingSources.find((x: any) => String(x.id) === String(source.id))?.materials || [];
    const existingMaterialIds = new Set<string>(existingMaterials.map((m: any) => String(m.id)));
    const keptMaterialIds = new Set<string>();

    for (let mIdx = 0; mIdx < source.materials.length; mIdx++) {
      const material = source.materials[mIdx];
      const materialPayload = {
        source_id: Number(sourceId),
        name: material.name.trim(),
        is_active: material.is_active !== false,
        sort_order: mIdx + 1,
      };

      const materialId = material.id ? String(material.id) : "";
      if (materialId) {
        keptMaterialIds.add(materialId);
        const { error: upErr } = await supabaseServer.from("source_materials").update(materialPayload).eq("id", materialId);
        if (upErr) return res.status(500).json({ error: upErr.message || `Failed to update material ${material.name}` });
      } else {
        const { data: inserted, error: insErr } = await supabaseServer.from("source_materials").insert(materialPayload).select("id").single();
        if (insErr || !inserted?.id) return res.status(500).json({ error: insErr?.message || `Failed to create material ${material.name}` });
        keptMaterialIds.add(String(inserted.id));
      }
    }

    const deleteMaterialIds = Array.from(existingMaterialIds).filter((id) => !keptMaterialIds.has(id));
    if (deleteMaterialIds.length) {
      const { error: delErr } = await supabaseServer.from("source_materials").delete().in("id", deleteMaterialIds.map((id) => Number(id)));
      if (delErr) return res.status(500).json({ error: delErr.message || `Failed to delete removed materials for ${source.name}` });
    }
  }

  const deleteSourceIds = Array.from(existingSourceIds).filter((id) => !keptSourceIds.has(id));
  if (deleteSourceIds.length) {
    const sourceNums = deleteSourceIds.map((id) => Number(id)).filter((n) => Number.isFinite(n));
    if (sourceNums.length) {
      const { error: delMatErr } = await supabaseServer.from("source_materials").delete().in("source_id", sourceNums);
      if (delMatErr) return res.status(500).json({ error: delMatErr.message || "Failed to delete removed source materials" });
      const { error: delSrcErr } = await supabaseServer.from("material_sources").delete().in("id", sourceNums);
      if (delSrcErr) return res.status(500).json({ error: delSrcErr.message || "Failed to delete removed sources" });
    }
  }

  const refreshed = await loadCatalog();
  if (refreshed.error) return res.status(500).json({ error: refreshed.error.message || "Saved, but failed to reload catalog" });

  return res.status(200).json({ ok: true, sources: refreshed.sources || [] });
}
