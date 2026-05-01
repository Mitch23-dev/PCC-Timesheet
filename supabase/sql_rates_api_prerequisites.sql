-- Run in Supabase SQL Editor if Admin → Rates shows "schema not ready" or Save is disabled.
-- Base sql_setup.sql does NOT include everything GET /api/admin/rates expects.
-- This file is idempotent (safe to re-run).

-- equipment_catalog: detail columns (v21) + timestamps (POST /api/admin/rates updates updated_at)
alter table public.equipment_catalog
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists unit_number text null,
  add column if not exists equipment_year text null,
  add column if not exists model text null,
  add column if not exists vin_number text null;

-- From sql_migrations_v26.sql — equipment_classes + material rate columns
create table if not exists public.equipment_classes (
  id bigserial primary key,
  name text not null unique,
  type text not null check (type in ('truck', 'equipment')),
  hourly_rate numeric(12,2) not null default 0,
  payload_tonnes numeric(12,2) null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id bigserial primary key,
  equipment_class_id bigint not null references public.equipment_classes(id) on delete cascade,
  name text not null,
  hourly_rate_addon numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attachments_class_name_unique unique (equipment_class_id, name)
);

alter table public.equipment_catalog
  add column if not exists equipment_class_id bigint references public.equipment_classes(id);

alter table public.source_materials
  add column if not exists cost_per_tonne numeric(12,2),
  add column if not exists markup_percent numeric(12,2),
  add column if not exists default_truck_class_id bigint references public.equipment_classes(id),
  add column if not exists updated_at timestamptz not null default now();
