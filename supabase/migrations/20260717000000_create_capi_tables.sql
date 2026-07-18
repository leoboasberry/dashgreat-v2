-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- ── capi_pixels ───────────────────────────────────────────────────────────────
-- Stores Meta Pixel configurations for the CAPI server-side dispatcher.
-- Access tokens are stored in plain text (internal tool, anon key is app-gated).
create table if not exists capi_pixels (
  id                 uuid        primary key default gen_random_uuid(),
  name               text        not null,
  pixel_id           text        not null,
  access_token       text        not null,
  test_event_code    text,
  enabled            boolean     not null default true,
  event_mapping      jsonb       not null default '{}',
  filters            jsonb       not null default '{}',
  lookback_days      int         not null default 30,
  auto_dispatch      boolean     not null default true,
  interval_minutes   int         not null default 60,
  last_dispatched_at timestamptz,
  created_at         timestamptz not null default now()
);

alter table capi_pixels enable row level security;
create policy "anon_all" on capi_pixels for all to anon using (true) with check (true);

-- ── capi_sent ─────────────────────────────────────────────────────────────────
-- Tracks which Supabase event_ids have already been sent per pixel,
-- preventing re-sends on every cron run.
create table if not exists capi_sent (
  pixel_id   text        not null,   -- Meta Pixel ID (not capi_pixels.id)
  event_id   text        not null,   -- Supabase events.event_id
  sent_at    timestamptz not null default now(),
  primary key (pixel_id, event_id)
);

alter table capi_sent enable row level security;
create policy "anon_select"  on capi_sent for select to anon using (true);
create policy "anon_insert"  on capi_sent for insert to anon with check (true);
create policy "anon_delete"  on capi_sent for delete to anon using (true);

-- ── capi_dispatch_log ─────────────────────────────────────────────────────────
create table if not exists capi_dispatch_log (
  id                 uuid        primary key default gen_random_uuid(),
  pixel_db_id        uuid        references capi_pixels(id) on delete set null,
  pixel_name         text        not null,
  started_at         timestamptz not null default now(),
  events_attempted   int         not null default 0,
  events_sent        int         not null default 0,
  errors             text[]      not null default '{}'
);

alter table capi_dispatch_log enable row level security;
create policy "anon_all" on capi_dispatch_log for all to anon using (true) with check (true);

-- ── pg_cron schedule ─────────────────────────────────────────────────────────
-- Calls the Edge Function every 30 minutes.
-- Uses the anon key (public) to invoke — the function uses service_role internally.
-- Replace SUPABASE_ANON_KEY_PLACEHOLDER with the actual anon key if running via SQL editor.
-- The supabase/functions/capi-dispatch deployment handles this automatically via secrets.

select cron.schedule(
  'capi-auto-dispatch',
  '*/30 * * * *',
  $$
  select net.http_post(
    url     := 'https://nujbmgzimpizxiehfzos.supabase.co/functions/v1/capi-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51amJtZ3ppbXBpenhpZWhmem9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MzA5NDksImV4cCI6MjA4OTUwNjk0OX0.180HgC6Ybs6ysVDdBy1tlumSu2Ef6lW8qx2GpioUfG0'
    ),
    body    := '{"auto":true}'::jsonb
  );
  $$
);
