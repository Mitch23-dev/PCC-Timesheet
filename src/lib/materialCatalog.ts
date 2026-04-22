import { MATERIALS } from "@/lib/constants";

export type MaterialCatalogMaterial = {
  id?: number | string;
  name: string;
  is_active?: boolean;
  sort_order?: number;
};

export type MaterialCatalogSource = {
  id?: number | string;
  name: string;
  is_active?: boolean;
  sort_order?: number;
  materials: MaterialCatalogMaterial[];
};

function sortByOrderThenName<T extends { sort_order?: number; name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ao = Number(a.sort_order ?? 0);
    const bo = Number(b.sort_order ?? 0);
    if (ao !== bo) return ao - bo;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

export function buildMaterialLabel(sourceName: string, materialName: string) {
  const source = String(sourceName || "").trim();
  const material = String(materialName || "").trim();
  if (!material) return "";
  if (!source || source === "General" || source === "Custom / Other") return material;
  return `${source} - ${material}`;
}

export function legacyMaterialCatalog(): MaterialCatalogSource[] {
  const sourceMap = new Map<string, MaterialCatalogSource>();

  const ensure = (name: string) => {
    const key = name.trim() || "General";
    let found = sourceMap.get(key);
    if (!found) {
      found = {
        name: key,
        is_active: true,
        sort_order: key === "Conrads" ? 10 : key === "General" ? 20 : key === "Custom / Other" ? 999 : 100,
        materials: [],
      };
      sourceMap.set(key, found);
    }
    return found;
  };

  for (const item of MATERIALS) {
    const raw = String(item || "").trim();
    if (!raw) continue;

    let source = "General";
    let material = raw;

    const match = raw.match(/^(.+?)\s+-\s+(.+)$/);
    if (match) {
      source = match[1].trim();
      material = match[2].trim();
    }

    ensure(source).materials.push({
      name: material,
      is_active: true,
      sort_order: ensure(source).materials.length + 1,
    });
  }

  ensure("Custom / Other").materials.push({ name: "Other", is_active: true, sort_order: 1 });

  return sortByOrderThenName(Array.from(sourceMap.values())).map((source) => ({
    ...source,
    materials: sortByOrderThenName(source.materials),
  }));
}

export function normalizeMaterialCatalog(sources: any[]): MaterialCatalogSource[] {
  return sortByOrderThenName(
    (Array.isArray(sources) ? sources : [])
      .map((source, sourceIdx) => ({
        id: source?.id,
        name: String(source?.name || "").trim(),
        is_active: source?.is_active !== false,
        sort_order: Number(source?.sort_order ?? sourceIdx + 1),
        materials: sortByOrderThenName(
          (Array.isArray(source?.materials) ? source.materials : [])
            .map((material: any, matIdx: number) => ({
              id: material?.id,
              name: String(material?.name || "").trim(),
              is_active: material?.is_active !== false,
              sort_order: Number(material?.sort_order ?? matIdx + 1),
            }))
            .filter((material: MaterialCatalogMaterial) => material.name)
        ),
      }))
      .filter((source: MaterialCatalogSource) => source.name)
  );
}

export function flattenMaterialCatalog(sources: MaterialCatalogSource[]): string[] {
  const out: string[] = [];
  for (const source of normalizeMaterialCatalog(sources)) {
    for (const material of source.materials) {
      if (source.is_active === false || material.is_active === false) continue;
      out.push(buildMaterialLabel(source.name, material.name));
    }
  }
  return out;
}

export function getMaterialOptionsForSource(sources: MaterialCatalogSource[], sourceName: string): string[] {
  const source = normalizeMaterialCatalog(sources).find((x) => x.name === sourceName && x.is_active !== false);
  if (!source) return [];
  return source.materials.filter((m) => m.is_active !== false).map((m) => m.name);
}

export function parseStoredMaterialRow(row: any): { source: string; material: string; label: string } {
  const explicitSource = String(row?.source_name || row?.source || "").trim();
  const explicitMaterial = String(row?.material_name || row?.material_display || "").trim();
  const storedLabel = String(row?.material || "").trim();

  if (explicitSource && explicitMaterial) {
    return { source: explicitSource, material: explicitMaterial, label: buildMaterialLabel(explicitSource, explicitMaterial) || storedLabel };
  }

  const match = storedLabel.match(/^(.+?)\s+-\s+(.+)$/);
  if (match) {
    return {
      source: match[1].trim(),
      material: match[2].trim(),
      label: storedLabel,
    };
  }

  if (!storedLabel) return { source: "", material: "", label: "" };
  return { source: "General", material: storedLabel, label: storedLabel };
}
