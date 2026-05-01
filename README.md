# PCC Timesheet (Employee PIN-gated)

- Public worker form protected by **per-employee 4-digit PINs** (stored in Supabase `employees`)
- Admin portal (password header) with filters, edits (timesheet + equipment + materials), slip viewer, and PDF export.
- Worker dashboard: **My Timesheets** (Weekly Thu→Wed summaries + Year-to-date hours)
- Payroll locking: admin can lock/unlock a date range so workers can't edit after payroll

## Quick start
1) Create Supabase project, run SQL in `supabase/sql_setup.sql` and `supabase/sql_migrations.sql`
2) Create Storage bucket: `slips` (Private)
3) Create `.env.local` from `.env.example`
   - Add a strong `SESSION_SECRET` (random 32+ chars)
4) `npm install`
5) `npm run dev`

## Add employees + PINs
After running the SQL migrations, create employee rows (example):

```sql
insert into public.employees (name, pin) values
  ('Darren', '2026'),
  ('Mitchell', '1234');
```

Each employee PIN must be unique.
