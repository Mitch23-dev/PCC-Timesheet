begin;

alter table if exists public.material_rates
  add column if not exists tonnes_per_load numeric(12,2),
  add column if not exists markup_percent numeric(12,2),
  add column if not exists trucking_rate_per_hour numeric(12,2),
  add column if not exists base_truck_cycle_hours numeric(12,2) not null default 1.0,
  add column if not exists load_price numeric(12,2);

alter table if exists public.estimates
  add column if not exists truck_cycle_time_hours numeric(12,2);

create or replace function public.calculate_material_rate_load_price()
returns trigger
language plpgsql
as $$
declare
  v_price_per_tonne numeric := coalesce(new.price_per_tonne, 0);
  v_tonnes_per_load numeric := coalesce(new.tonnes_per_load, 0);
  v_markup_percent numeric := coalesce(new.markup_percent, 0);
  v_trucking_rate_per_hour numeric := coalesce(new.trucking_rate_per_hour, 0);
  v_base_truck_cycle_hours numeric := coalesce(nullif(new.base_truck_cycle_hours, 0), 1.0);
begin
  new.load_price := round((((v_price_per_tonne * v_tonnes_per_load) * (1 + (v_markup_percent / 100.0))) + (v_trucking_rate_per_hour * v_base_truck_cycle_hours))::numeric, 2);
  return new;
end;
$$;

drop trigger if exists trg_material_rates_load_price on public.material_rates;
create trigger trg_material_rates_load_price
before insert or update on public.material_rates
for each row
execute function public.calculate_material_rate_load_price();

update public.material_rates
set load_price = round((((coalesce(price_per_tonne, 0) * coalesce(tonnes_per_load, 0)) * (1 + (coalesce(markup_percent, 0) / 100.0))) + (coalesce(trucking_rate_per_hour, 0) * coalesce(nullif(base_truck_cycle_hours, 0), 1.0)))::numeric, 2)
where true;

commit;
