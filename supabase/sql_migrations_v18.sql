-- v18: Admin-managed material sources + materials for employee timesheet
-- Safe to run multiple times.

begin;

create table if not exists public.material_sources (
  id bigserial primary key,
  name text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.source_materials (
  id bigserial primary key,
  source_id bigint not null references public.material_sources(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_materials_source_name_unique unique (source_id, name)
);

create index if not exists material_sources_sort_idx on public.material_sources(sort_order, name);
create index if not exists source_materials_source_sort_idx on public.source_materials(source_id, sort_order, name);

alter table public.material_entries
  add column if not exists source_name text,
  add column if not exists material_name text;

insert into public.material_sources (name, is_active, sort_order)
values
  ('Conrads', true, 10),
  ('General', true, 20),
  ('Custom / Other', true, 999)
on conflict (name) do update set
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.source_materials (source_id, name, is_active, sort_order)
select s.id, v.name, true, v.sort_order
from public.material_sources s
join (
  values
    ('Conrads', '1/2" Clear Stone', 10),
    ('Conrads', '3/4" Clear Stone', 20),
    ('Conrads', '1" Clear Stone', 30),
    ('Conrads', '2" Clear Stone', 40),
    ('Conrads', '3" Clear Stone', 50),
    ('Conrads', '4-6" Clear Stone', 60),
    ('General', 'Rip Rap', 10),
    ('General', 'Class A/ Type 1S', 20),
    ('General', 'Class B/ Type 1', 30),
    ('General', 'Class C/ Type 2', 40),
    ('General', 'Class D', 50),
    ('General', 'Class E', 60),
    ('General', 'Surge (6" Minus)', 70),
    ('General', 'Crusher Dust - MRT', 80),
    ('General', 'Crusher Dust', 90),
    ('General', 'Topsoil', 100),
    ('General', 'Clay Fill', 110),
    ('General', 'Hardpan', 120),
    ('General', 'Septic Sand', 130),
    ('General', 'Granite Rock', 140),
    ('General', 'Screened Fill', 150),
    ('Custom / Other', 'Other', 10)
) as v(source_name, name, sort_order)
  on v.source_name = s.name
on conflict (source_id, name) do update set
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

commit;
