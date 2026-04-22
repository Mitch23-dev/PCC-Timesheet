-- v15: Extend employees table with standard employee fields
alter table public.employees
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists postal_code text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists notes text;
