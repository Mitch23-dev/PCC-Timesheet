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
