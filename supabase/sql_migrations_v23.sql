create table if not exists public.equipment_rates (
  id bigserial primary key,
  equipment_id bigint not null references public.equipment_catalog(id) on delete cascade,
  hourly_rate numeric(12,2) null,
  updated_at timestamptz not null default now(),
  constraint equipment_rates_equipment_unique unique (equipment_id)
);

create table if not exists public.attachment_rates (
  id bigserial primary key,
  attachment_id bigint not null references public.equipment_attachment_options(id) on delete cascade,
  hourly_rate numeric(12,2) null,
  updated_at timestamptz not null default now(),
  constraint attachment_rates_attachment_unique unique (attachment_id)
);

create table if not exists public.material_rates (
  id bigserial primary key,
  source_material_id bigint not null references public.source_materials(id) on delete cascade,
  price_per_tonne numeric(12,2) null,
  updated_at timestamptz not null default now(),
  constraint material_rates_source_material_unique unique (source_material_id)
);
