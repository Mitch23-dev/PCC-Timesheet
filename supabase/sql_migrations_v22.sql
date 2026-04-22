-- APP_125 - Weekly mechanic attachment selection

alter table public.weekly_timesheet_entries
  add column if not exists attachment_label text null;
