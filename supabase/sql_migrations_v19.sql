-- v19: Admin-managed equipment list + equipment-specific attachment dropdowns
-- Safe to run multiple times.

begin;

create table if not exists public.equipment_catalog (
  id bigserial primary key,
  name text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment_attachment_options (
  id bigserial primary key,
  equipment_id bigint not null references public.equipment_catalog(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_attachment_options_equipment_name_unique unique (equipment_id, name)
);

create index if not exists equipment_catalog_sort_idx on public.equipment_catalog(sort_order, name);
create index if not exists equipment_attachment_options_equipment_sort_idx on public.equipment_attachment_options(equipment_id, sort_order, name);

insert into public.equipment_catalog (name, is_active, sort_order) values
  ('Dump Truck', true, 10),
  ('Komatsu 210 (New)', true, 20),
  ('Komatsu 210 (Old)', true, 30),
  ('Komatsu 138 (New)', true, 40),
  ('Komatsu 138 (Old)', true, 50),
  ('John Deere 135', true, 60),
  ('Kubota 8 Ton', true, 70),
  ('Kubota Mini', true, 80),
  ('John Deere Mini', true, 90),
  ('Kubota Skid Steer', true, 100),
  ('John Deere Skid Steer', true, 110),
  ('Large Roller', true, 120),
  ('Small Roller', true, 130),
  ('Paver', true, 140)
on conflict (name) do update set is_active = excluded.is_active, sort_order = excluded.sort_order, updated_at = now();

insert into public.equipment_attachment_options (equipment_id, name, is_active, sort_order)
select e.id, v.name, true, v.sort_order
from public.equipment_catalog e
join (values
  ('Dump Truck', 'None', 10), ('Dump Truck', 'Pup Trailer', 20), ('Dump Truck', 'Float', 30),
  ('Komatsu 210 (New)', 'None', 10), ('Komatsu 210 (New)', 'Breaker', 20), ('Komatsu 210 (New)', 'Chipper', 30),
  ('Komatsu 210 (Old)', 'None', 10), ('Komatsu 210 (Old)', 'Breaker', 20), ('Komatsu 210 (Old)', 'Chipper', 30),
  ('Komatsu 138 (New)', 'None', 10), ('Komatsu 138 (New)', 'Breaker', 20), ('Komatsu 138 (New)', 'Chipper', 30),
  ('Komatsu 138 (Old)', 'None', 10), ('Komatsu 138 (Old)', 'Breaker', 20), ('Komatsu 138 (Old)', 'Chipper', 30),
  ('John Deere 135', 'None', 10), ('John Deere 135', 'Breaker', 20), ('John Deere 135', 'Chipper', 30),
  ('Kubota 8 Ton', 'None', 10), ('Kubota 8 Ton', 'Breaker', 20), ('Kubota 8 Ton', 'Chipper', 30),
  ('Kubota Mini', 'None', 10), ('Kubota Mini', 'Breaker', 20), ('Kubota Mini', 'Chipper', 30),
  ('John Deere Mini', 'None', 10), ('John Deere Mini', 'Breaker', 20), ('John Deere Mini', 'Chipper', 30),
  ('Kubota Skid Steer', 'None', 10), ('Kubota Skid Steer', 'Bucket', 20), ('Kubota Skid Steer', 'Forks', 30), ('Kubota Skid Steer', 'Grapple', 40), ('Kubota Skid Steer', 'Auger', 50), ('Kubota Skid Steer', 'Broom', 60), ('Kubota Skid Steer', 'Breaker', 70),
  ('John Deere Skid Steer', 'None', 10), ('John Deere Skid Steer', 'Bucket', 20), ('John Deere Skid Steer', 'Forks', 30), ('John Deere Skid Steer', 'Grapple', 40), ('John Deere Skid Steer', 'Auger', 50), ('John Deere Skid Steer', 'Broom', 60), ('John Deere Skid Steer', 'Breaker', 70)
) as v(equipment_name, name, sort_order) on v.equipment_name = e.name
on conflict (equipment_id, name) do update set is_active = excluded.is_active, sort_order = excluded.sort_order, updated_at = now();

commit;
