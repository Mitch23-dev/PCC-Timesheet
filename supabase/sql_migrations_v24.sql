begin;

create extension if not exists pgcrypto;

create table if not exists public.estimates (
  id text primary key,
  quote_number text,
  project_name text not null default '',
  client_name text not null default '',
  project_location text not null default '',
  estimator text not null default '',
  estimate_date date,
  revision text not null default '0',
  expected_start text not null default '',
  expected_duration text not null default '',
  status text not null default 'draft' check (status in ('draft', 'quoted')),
  notes text not null default '',
  exclusions text not null default '',
  subtotal numeric(14,2) not null default 0,
  quote_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists estimates_status_idx on public.estimates(status);
create index if not exists estimates_quote_id_idx on public.estimates(quote_id);
create index if not exists estimates_project_name_idx on public.estimates(project_name);

create table if not exists public.estimate_rows (
  id text primary key,
  estimate_id text not null references public.estimates(id) on delete cascade,
  row_order integer not null default 0,
  type text not null check (type in ('item', 'header', 'subtotal')),
  item text not null default '',
  description text not null default '',
  unit text not null default '',
  quantity text not null default '',
  rate text not null default '',
  amount text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists estimate_rows_estimate_id_idx on public.estimate_rows(estimate_id);
create index if not exists estimate_rows_estimate_order_idx on public.estimate_rows(estimate_id, row_order);

create table if not exists public.quotes (
  id text primary key,
  estimate_id text not null references public.estimates(id) on delete restrict,
  quote_number text not null,
  project_name text not null default '',
  client_name text not null default '',
  project_location text not null default '',
  estimate_total numeric(14,2) not null default 0,
  revision text not null default '0',
  status text not null default 'draft' check (status in ('draft', 'ready', 'sent', 'awarded', 'lost', 'cancelled', 'started')),
  notes text not null default '',
  active_job_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists quotes_quote_number_uidx on public.quotes(quote_number);
create index if not exists quotes_estimate_id_idx on public.quotes(estimate_id);
create index if not exists quotes_status_idx on public.quotes(status);

create table if not exists public.active_jobs (
  id text primary key,
  quote_id text not null references public.quotes(id) on delete restrict,
  quote_number text not null,
  job_number text not null,
  project_name text not null default '',
  client_name text not null default '',
  project_location text not null default '',
  contract_value numeric(14,2) not null default 0,
  status text not null default 'active' check (status in ('active', 'on-hold')),
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists active_jobs_job_number_uidx on public.active_jobs(job_number);
create unique index if not exists active_jobs_quote_id_uidx on public.active_jobs(quote_id);
create index if not exists active_jobs_status_idx on public.active_jobs(status);

create table if not exists public.completed_jobs (
  id text primary key,
  quote_id text not null references public.quotes(id) on delete restrict,
  active_job_id text not null,
  quote_number text not null,
  job_number text not null,
  project_name text not null default '',
  client_name text not null default '',
  project_location text not null default '',
  contract_value numeric(14,2) not null default 0,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists completed_jobs_active_job_id_uidx on public.completed_jobs(active_job_id);
create unique index if not exists completed_jobs_job_number_uidx on public.completed_jobs(job_number);
create index if not exists completed_jobs_quote_id_idx on public.completed_jobs(quote_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_estimates_updated_at on public.estimates;
create trigger trg_estimates_updated_at
before update on public.estimates
for each row execute function public.set_updated_at();

drop trigger if exists trg_estimate_rows_updated_at on public.estimate_rows;
create trigger trg_estimate_rows_updated_at
before update on public.estimate_rows
for each row execute function public.set_updated_at();

drop trigger if exists trg_quotes_updated_at on public.quotes;
create trigger trg_quotes_updated_at
before update on public.quotes
for each row execute function public.set_updated_at();

drop trigger if exists trg_active_jobs_updated_at on public.active_jobs;
create trigger trg_active_jobs_updated_at
before update on public.active_jobs
for each row execute function public.set_updated_at();

drop trigger if exists trg_completed_jobs_updated_at on public.completed_jobs;
create trigger trg_completed_jobs_updated_at
before update on public.completed_jobs
for each row execute function public.set_updated_at();

with raw as (
  select
    case
      when jsonb_typeof(value::jsonb) = 'object' then value::jsonb
      else '{}'::jsonb
    end as j
  from public.app_settings
  where key = 'project_pipeline_v1'
),
estimates_src as (
  select jsonb_array_elements(coalesce(j->'estimates', '[]'::jsonb)) as e
  from raw
)
insert into public.estimates (
  id, quote_number, project_name, client_name, project_location, estimator,
  estimate_date, revision, expected_start, expected_duration, status,
  notes, exclusions, subtotal, quote_id, created_at, updated_at
)
select
  e->>'id',
  nullif(e->>'quoteNumber',''),
  coalesce(e->>'projectName',''),
  coalesce(e->>'clientName',''),
  coalesce(e->>'projectLocation',''),
  coalesce(e->>'estimator',''),
  nullif(e->>'estimateDate','')::date,
  coalesce(e->>'revision','0'),
  coalesce(e->>'expectedStart',''),
  coalesce(e->>'expectedDuration',''),
  case when coalesce(e->>'status','draft') in ('draft','quoted') then e->>'status' else 'draft' end,
  coalesce(e->>'notes',''),
  coalesce(e->>'exclusions',''),
  coalesce((e->>'subtotal')::numeric, 0),
  nullif(e->>'quoteId',''),
  coalesce(nullif(e->>'createdAt','')::timestamptz, now()),
  coalesce(nullif(e->>'updatedAt','')::timestamptz, now())
from estimates_src
where coalesce(e->>'id','') <> ''
on conflict (id) do nothing;

with raw as (
  select
    case
      when jsonb_typeof(value::jsonb) = 'object' then value::jsonb
      else '{}'::jsonb
    end as j
  from public.app_settings
  where key = 'project_pipeline_v1'
),
estimates_src as (
  select jsonb_array_elements(coalesce(j->'estimates', '[]'::jsonb)) as e
  from raw
),
rows_src as (
  select
    e->>'id' as estimate_id,
    r,
    ordinality - 1 as row_order
  from estimates_src,
       jsonb_array_elements(coalesce(e->'rows', '[]'::jsonb)) with ordinality as t(r, ordinality)
)
insert into public.estimate_rows (
  id, estimate_id, row_order, type, item, description, unit,
  quantity, rate, amount, notes, created_at, updated_at
)
select
  coalesce(nullif(r->>'id',''), gen_random_uuid()::text),
  estimate_id,
  row_order,
  case when coalesce(r->>'type','item') in ('item','header','subtotal') then r->>'type' else 'item' end,
  coalesce(r->>'item',''),
  coalesce(r->>'description',''),
  coalesce(r->>'unit',''),
  coalesce(r->>'quantity',''),
  coalesce(r->>'rate',''),
  coalesce(r->>'amount',''),
  coalesce(r->>'notes',''),
  now(),
  now()
from rows_src
where coalesce(estimate_id,'') <> ''
on conflict (id) do nothing;

with raw as (
  select
    case
      when jsonb_typeof(value::jsonb) = 'object' then value::jsonb
      else '{}'::jsonb
    end as j
  from public.app_settings
  where key = 'project_pipeline_v1'
),
quotes_src as (
  select jsonb_array_elements(coalesce(j->'quotes', '[]'::jsonb)) as q
  from raw
)
insert into public.quotes (
  id, estimate_id, quote_number, project_name, client_name, project_location,
  estimate_total, revision, status, notes, active_job_id, created_at, updated_at
)
select
  q->>'id',
  q->>'estimateId',
  coalesce(q->>'quoteNumber',''),
  coalesce(q->>'projectName',''),
  coalesce(q->>'clientName',''),
  coalesce(q->>'projectLocation',''),
  coalesce((q->>'estimateTotal')::numeric, 0),
  coalesce(q->>'revision','0'),
  case when coalesce(q->>'status','draft') in ('draft','ready','sent','awarded','lost','cancelled','started') then q->>'status' else 'draft' end,
  coalesce(q->>'notes',''),
  nullif(q->>'activeJobId',''),
  coalesce(nullif(q->>'createdAt','')::timestamptz, now()),
  coalesce(nullif(q->>'updatedAt','')::timestamptz, now())
from quotes_src
where coalesce(q->>'id','') <> '' and coalesce(q->>'estimateId','') <> ''
on conflict (id) do nothing;

with raw as (
  select
    case
      when jsonb_typeof(value::jsonb) = 'object' then value::jsonb
      else '{}'::jsonb
    end as j
  from public.app_settings
  where key = 'project_pipeline_v1'
),
active_src as (
  select jsonb_array_elements(coalesce(j->'activeJobs', '[]'::jsonb)) as a
  from raw
)
insert into public.active_jobs (
  id, quote_id, quote_number, job_number, project_name, client_name,
  project_location, contract_value, status, started_at, completed_at,
  notes, created_at, updated_at
)
select
  a->>'id',
  a->>'quoteId',
  coalesce(a->>'quoteNumber',''),
  coalesce(a->>'jobNumber',''),
  coalesce(a->>'projectName',''),
  coalesce(a->>'clientName',''),
  coalesce(a->>'projectLocation',''),
  coalesce((a->>'contractValue')::numeric, 0),
  case when coalesce(a->>'status','active') in ('active','on-hold') then a->>'status' else 'active' end,
  coalesce(nullif(a->>'startedAt','')::timestamptz, now()),
  nullif(a->>'completedAt','')::timestamptz,
  coalesce(a->>'notes',''),
  now(),
  now()
from active_src
where coalesce(a->>'id','') <> '' and coalesce(a->>'quoteId','') <> ''
on conflict (id) do nothing;

with raw as (
  select
    case
      when jsonb_typeof(value::jsonb) = 'object' then value::jsonb
      else '{}'::jsonb
    end as j
  from public.app_settings
  where key = 'project_pipeline_v1'
),
completed_src as (
  select jsonb_array_elements(coalesce(j->'completedJobs', '[]'::jsonb)) as c
  from raw
)
insert into public.completed_jobs (
  id, quote_id, active_job_id, quote_number, job_number, project_name, client_name,
  project_location, contract_value, started_at, completed_at, notes, created_at, updated_at
)
select
  c->>'id',
  c->>'quoteId',
  c->>'activeJobId',
  coalesce(c->>'quoteNumber',''),
  coalesce(c->>'jobNumber',''),
  coalesce(c->>'projectName',''),
  coalesce(c->>'clientName',''),
  coalesce(c->>'projectLocation',''),
  coalesce((c->>'contractValue')::numeric, 0),
  coalesce(nullif(c->>'startedAt','')::timestamptz, now()),
  coalesce(nullif(c->>'completedAt','')::timestamptz, now()),
  coalesce(c->>'notes',''),
  now(),
  now()
from completed_src
where coalesce(c->>'id','') <> '' and coalesce(c->>'quoteId','') <> '' and coalesce(c->>'activeJobId','') <> ''
on conflict (id) do nothing;

commit;
