import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { legacyMaterialCatalog, normalizeMaterialCatalog, flattenMaterialCatalog } from "@/lib/materialCatalog";

function isMissingSchemaError(err: any) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const src = await supabaseServer
    .from("material_sources")
    .select("id, name, is_active, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (src.error) {
    if (isMissingSchemaError(src.error)) {
      const fallback = legacyMaterialCatalog();
      return res.status(200).json({
        sources: fallback,
        options: flattenMaterialCatalog(fallback),
        usingFallback: true,
        schemaReady: false,
      });
    }
    return res.status(500).json({ error: src.error.message || "Failed to load material sources" });
  }

  const sources = src.data || [];
  const sourceIds = sources.map((s: any) => s.id).filter(Boolean);

  const mats = sourceIds.length
    ? await supabaseServer
        .from("source_materials")
        .select("id, source_id, name, is_active, sort_order")
        .in("source_id", sourceIds)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
    : { data: [], error: null } as any;

  if (mats.error) {
    if (isMissingSchemaError(mats.error)) {
      const fallback = legacyMaterialCatalog();
      return res.status(200).json({
        sources: fallback,
        options: flattenMaterialCatalog(fallback),
        usingFallback: true,
        schemaReady: false,
      });
    }
    return res.status(500).json({ error: mats.error.message || "Failed to load materials" });
  }

  const bySource = new Map<any, any[]>();
  for (const m of mats.data || []) {
    const list = bySource.get((m as any).source_id) || [];
    list.push(m);
    bySource.set((m as any).source_id, list);
  }

  const catalog = normalizeMaterialCatalog(
    (sources || []).map((s: any) => ({
      ...s,
      materials: bySource.get(s.id) || [],
    }))
  ).filter((s) => s.is_active !== false);

  const activeCatalog = catalog.map((source) => ({
    ...source,
    materials: source.materials.filter((m) => m.is_active !== false),
  })).filter((source) => source.materials.length > 0);

  if (!activeCatalog.length) {
    const fallback = legacyMaterialCatalog();
    return res.status(200).json({
      sources: fallback,
      options: flattenMaterialCatalog(fallback),
      usingFallback: true,
      schemaReady: true,
    });
  }

  return res.status(200).json({
    sources: activeCatalog,
    options: flattenMaterialCatalog(activeCatalog),
    usingFallback: false,
    schemaReady: true,
  });
}
