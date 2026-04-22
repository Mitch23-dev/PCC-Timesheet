import { ATTACHMENTS, DUMP_TRUCK_ATTACHMENTS, EQUIPMENT, EXCAVATORS, SKID_STEER_ATTACHMENTS } from "@/lib/constants";

export type EquipmentCatalogAttachment = {
  id?: number | string;
  name: string;
  is_active?: boolean;
  sort_order?: number;
};

export type EquipmentCatalogItem = {
  id?: number | string;
  name: string;
  equipment_class_id?: number | string | null;
  unit_number?: string;
  equipment_year?: string;
  model?: string;
  vin_number?: string;
  is_active?: boolean;
  sort_order?: number;
  attachments: EquipmentCatalogAttachment[];
};

function sortByOrderThenName<T extends { sort_order?: number; name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ao = Number(a.sort_order ?? 0);
    const bo = Number(b.sort_order ?? 0);
    if (ao !== bo) return ao - bo;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

export function legacyEquipmentCatalog(): EquipmentCatalogItem[] {
  return sortByOrderThenName(
    Array.from(EQUIPMENT).map((name, idx) => {
      const isSkid = name === "Kubota Skid Steer" || name === "John Deere Skid Steer";
      const attachments = name === "Dump Truck"
        ? [...DUMP_TRUCK_ATTACHMENTS]
        : isSkid
          ? [...SKID_STEER_ATTACHMENTS]
          : EXCAVATORS.has(name)
            ? [...ATTACHMENTS]
            : [];
      return {
        name,
        unit_number: "",
        equipment_year: "",
        model: "",
        vin_number: "",
        is_active: true,
        sort_order: idx + 1,
        attachments: attachments.map((attachment, aIdx) => ({ name: String(attachment), is_active: true, sort_order: aIdx + 1 })),
      } satisfies EquipmentCatalogItem;
    })
  );
}

export function normalizeEquipmentCatalog(items: any[]): EquipmentCatalogItem[] {
  return sortByOrderThenName(
    (Array.isArray(items) ? items : [])
      .map((item, itemIdx) => ({
        id: item?.id,
        name: String(item?.name || "").trim(),
        equipment_class_id: item?.equipment_class_id ?? null,
        unit_number: String(item?.unit_number || "").trim(),
        equipment_year: String(item?.equipment_year || "").trim(),
        model: String(item?.model || "").trim(),
        vin_number: String(item?.vin_number || "").trim(),
        is_active: item?.is_active !== false,
        sort_order: Number(item?.sort_order ?? itemIdx + 1),
        attachments: sortByOrderThenName(
          (Array.isArray(item?.attachments) ? item.attachments : [])
            .map((attachment: any, attachIdx: number) => ({
              id: attachment?.id,
              name: String(attachment?.name || "").trim(),
              is_active: attachment?.is_active !== false,
              sort_order: Number(attachment?.sort_order ?? attachIdx + 1),
            }))
            .filter((attachment: EquipmentCatalogAttachment) => attachment.name)
        ),
      }))
      .filter((item: EquipmentCatalogItem) => item.name)
  );
}

export function flattenEquipmentCatalog(items: EquipmentCatalogItem[]): string[] {
  return normalizeEquipmentCatalog(items).filter((item) => item.is_active !== false).map((item) => item.name);
}

export function getAttachmentOptionsForEquipment(items: EquipmentCatalogItem[], equipmentName: string): string[] {
  const equipment = normalizeEquipmentCatalog(items).find((item) => item.name === equipmentName && item.is_active !== false);
  if (!equipment) return [];
  return equipment.attachments
    .filter((attachment) => attachment.is_active !== false)
    .map((attachment) => attachment.name)
    .filter((name) => String(name || "").trim() && String(name || "").trim().toLowerCase() !== "none");
}

export function getAttachmentDropdownOptionsForEquipment(items: EquipmentCatalogItem[], equipmentName: string): Array<{ value: string; label: string }> {
  const attachmentOptions = getAttachmentOptionsForEquipment(items, equipmentName);
  if (!attachmentOptions.length) return [];
  return [{ value: "", label: "None" }, ...attachmentOptions.map((name) => ({ value: name, label: name }))];
}
