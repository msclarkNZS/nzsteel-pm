-- ─── NZ Steel PM — Supabase storage setup ────────────────────────────────────
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It creates the two private buckets and the access rules that enforce:
--   • Technicians (anon, not signed in): list + download worklists, upload results.
--   • Supervisor  (signed in):           also upload worklists, read + delete results.
-- A technician can NEVER read back results — there is no select policy for anon
-- on the results bucket.

-- 1. Buckets (private; not publicly listable)
insert into storage.buckets (id, name, public)
values ('worklists', 'worklists', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('results', 'results', false)
on conflict (id) do nothing;

-- 2. WORKLISTS policies ---------------------------------------------------------
-- read/list: everyone (anon + signed in)
create policy "worklists_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'worklists');

-- write/update/delete: supervisor (signed in) only
create policy "worklists_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'worklists');

create policy "worklists_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'worklists');

create policy "worklists_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'worklists');

-- 3. RESULTS policies -----------------------------------------------------------
-- upload: everyone (techs push) — INSERT only, no read
create policy "results_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'results');

-- read/list + delete: supervisor (signed in) only
create policy "results_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'results');

create policy "results_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'results');
