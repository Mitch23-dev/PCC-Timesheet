-- Run this first in Supabase SQL Editor
create extension if not exists pgcrypto;

create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value)
values ('pin', '2026')
on conflict (key) do update set value = excluded.value, updated_at = now();

create table if not exists timesheets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  work_date date not null,
  worker_name text not null,
  job_type text not null,
  job_text text not null,
  total_hours numeric not null,
  notes text
);

create table if not exists equipment_entries (
  id uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references timesheets(id) on delete cascade,
  equipment text not null,
  attachment text,
  hours numeric,
  notes text,
  trucking_hours numeric,
  trucking_notes text
);

create table if not exists material_entries (
  id uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references timesheets(id) on delete cascade,
  material text not null,
  loads numeric not null,
  notes text
);

create table if not exists photo_entries (
  id uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references timesheets(id) on delete cascade,
  path text not null,
  filename text not null,
  created_at timestamptz not null default now()
);


create table if not exists material_sources (
  id bigserial primary key,
  name text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists source_materials (
  id bigserial primary key,
  source_id bigint not null references material_sources(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_materials_source_name_unique unique (source_id, name)
);

alter table material_entries
  add column if not exists source_name text,
  add column if not exists material_name text;


create table if not exists equipment_catalog (
  id bigserial primary key,
  name text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists equipment_attachment_options (
  id bigserial primary key,
  equipment_id bigint not null references equipment_catalog(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_attachment_options_equipment_name_unique unique (equipment_id, name)
);


-- v20
alter table public.employees
  add column if not exists timesheet_type text not null default 'standard';

create table if not exists public.weekly_timesheets (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.employees(id) on delete cascade,
  employee_name text not null,
  week_start date not null,
  timesheet_type text not null default 'management',
  status text not null default 'draft',
  total_hours numeric not null default 0,
  submitted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists weekly_timesheets_emp_week_type_uidx
  on public.weekly_timesheets (employee_id, week_start, timesheet_type);
create table if not exists public.weekly_timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  weekly_timesheet_id uuid not null references public.weekly_timesheets(id) on delete cascade,
  entry_date date not null,
  start_time text not null,
  end_time text not null,
  hours numeric not null default 0,
  job_label text null,
  equipment_label text null,
  attachment_label text null,
  description text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
