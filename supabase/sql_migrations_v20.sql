-- APP_115 - Timesheet types + weekly grid timesheets

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

create index if not exists weekly_timesheets_emp_week_idx
  on public.weekly_timesheets (employee_id, week_start desc);

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

create index if not exists weekly_timesheet_entries_sheet_sort_idx
  on public.weekly_timesheet_entries (weekly_timesheet_id, entry_date, sort_order);
