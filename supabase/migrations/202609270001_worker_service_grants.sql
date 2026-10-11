begin;

-- The worker's server-side secret key uses service_role. RLS bypass does not
-- replace ordinary table privileges for direct PostgREST writes.
grant usage on schema public to service_role;
grant select, update on table public.vocal_jobs to service_role;
grant select, insert, delete on table public.media_assets to service_role;

commit;
