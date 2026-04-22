begin;

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

alter table if exists public.equipment_catalog
  add column if not exists equipment_class_id bigint references public.equipment_classes(id);

alter table if exists public.source_materials
  add column if not exists cost_per_tonne numeric(12,2),
  add column if not exists markup_percent numeric(12,2),
  add column if not exists default_truck_class_id bigint references public.equipment_classes(id);

alter table if exists public.estimate_rows
  add column if not exists row_kind text check (row_kind in ('custom', 'equipment', 'material')),
  add column if not exists equipment_unit_id bigint references public.equipment_catalog(id),
  add column if not exists equipment_class_id bigint references public.equipment_classes(id),
  add column if not exists attachment_id bigint references public.attachments(id),
  add column if not exists material_id bigint references public.source_materials(id),
  add column if not exists cycle_time_hours numeric(12,2);

with eq as (
  select e.id as equipment_id, e.name as equipment_name, e.sort_order, er.hourly_rate
  from public.equipment_catalog e
  left join public.equipment_rates er on er.equipment_id = e.id
),
inserted as (
  insert into public.equipment_classes (name, type, hourly_rate, payload_tonnes, active)
  select
    eq.equipment_name,
    case when lower(eq.equipment_name) like '%truck%' then 'truck' else 'equipment' end,
    coalesce(eq.hourly_rate, 0),
    null,
    true
  from eq
  on conflict (name) do update
    set hourly_rate = excluded.hourly_rate,
        active = excluded.active,
        updated_at = now()
  returning id, name
)
update public.equipment_catalog c
set equipment_class_id = cls.id
from public.equipment_classes cls
where c.name = cls.name
  and c.equipment_class_id is null;

insert into public.attachments (equipment_class_id, name, hourly_rate_addon, active)
select
  c.equipment_class_id,
  a.name,
  coalesce(ar.hourly_rate, 0),
  coalesce(a.is_active, true)
from public.equipment_attachment_options a
join public.equipment_catalog c on c.id = a.equipment_id
left join public.attachment_rates ar on ar.attachment_id = a.id
where c.equipment_class_id is not null
  and lower(coalesce(a.name, '')) <> 'none'
on conflict (equipment_class_id, name) do update
  set hourly_rate_addon = excluded.hourly_rate_addon,
      active = excluded.active,
      updated_at = now();

do $$
declare
  has_price_per_tonne boolean;
  has_markup_percent boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'material_rates'
      and column_name = 'price_per_tonne'
  ) into has_price_per_tonne;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'material_rates'
      and column_name = 'markup_percent'
  ) into has_markup_percent;

  if has_price_per_tonne and has_markup_percent then
    execute $sql$
      update public.source_materials sm
      set
        cost_per_tonne = coalesce(sm.cost_per_tonne, mr.price_per_tonne),
        markup_percent = coalesce(sm.markup_percent, mr.markup_percent)
      from public.material_rates mr
      where mr.source_material_id = sm.id
    $sql$;
  elsif has_price_per_tonne then
    execute $sql$
      update public.source_materials sm
      set
        cost_per_tonne = coalesce(sm.cost_per_tonne, mr.price_per_tonne)
      from public.material_rates mr
      where mr.source_material_id = sm.id
    $sql$;
  end if;
end $$;

with first_truck as (
  select id
  from public.equipment_classes
  where type = 'truck' and active = true
  order by id
  limit 1
)
update public.source_materials sm
set default_truck_class_id = ft.id
from first_truck ft
where sm.default_truck_class_id is null;

commit;
