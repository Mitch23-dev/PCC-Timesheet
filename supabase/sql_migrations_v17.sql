-- v17: Extend employees table with full employee profile fields used by the admin UI
-- Safe to run multiple times.

alter table public.employees
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists postal_code text,
  add column if not exists position text,
  add column if not exists employment_type text,
  add column if not exists hourly_rate numeric,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists notes text;
