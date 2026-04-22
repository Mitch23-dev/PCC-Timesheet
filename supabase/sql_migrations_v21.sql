-- APP_123 - Equipment resource details

alter table public.equipment_catalog
  add column if not exists unit_number text null,
  add column if not exists equipment_year text null,
  add column if not exists model text null,
  add column if not exists vin_number text null;
