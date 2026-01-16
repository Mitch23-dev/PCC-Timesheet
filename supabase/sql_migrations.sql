-- =========================================
-- PCC Timesheet App - Employee PIN + Locking Migration
-- Supabase (Postgres)
--
-- This project uses timesheets.work_date as the work date column.
-- =========================================

begin;

-- 1) Employees table
create table if not exists public.employees (
  id bigserial primary key,
  name text not null,
  pin text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_pin_4_digits check (pin ~ '^[0-9]{4}$')
);

-- Unique PINs (recommended)
create unique index if not exists employees_pin_unique_idx on public.employees (pin);

-- 2) Timesheets schema updates
alter table public.timesheets
  add column if not exists employee_id bigint,
  add column if not exists week_start date,
  add column if not exists locked boolean not null default false;

-- 3) Foreign key to employees
do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints tc
    where tc.constraint_schema = 'public'
      and tc.table_name = 'timesheets'
      and tc.constraint_name = 'timesheets_employee_id_fkey'
  ) then
    alter table public.timesheets
      add constraint timesheets_employee_id_fkey
      foreign key (employee_id) references public.employees(id)
      on delete set null;
  end if;
end $$;

-- 4) Backfill week_start from work_date using Thu->Wed week start
-- week_start = work_date - ((dow(work_date) - 4 + 7) % 7)
update public.timesheets
set week_start =
  (work_date::date
   - (((extract(dow from work_date::date)::int - 4 + 7) % 7)) * interval '1 day')::date
where week_start is null
  and work_date is not null;

-- 5) Helpful indexes
create index if not exists timesheets_employee_id_idx on public.timesheets(employee_id);
create index if not exists timesheets_week_start_idx on public.timesheets(week_start);
create index if not exists timesheets_employee_week_idx on public.timesheets(employee_id, week_start);

commit;
