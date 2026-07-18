-- lead_enrichments: stores per-email enrichment data extracted from GreatPages leads.
-- The CAPI Edge Function reads from this table so auto-dispatch (pg_cron) has
-- phone, name, city, state, zip, fbc matching data — not just email + country.
--
-- Populated by the browser whenever GreatPages pages are loaded in the CAPI tab.

create table if not exists lead_enrichments (
  email_norm  text primary key,
  phone       text,
  fn          text,
  ln          text,
  city        text,
  state       text,
  zip         text,
  fbp         text,
  fbc         text,
  fbclid      text,
  lead_ts     bigint,
  updated_at  timestamptz not null default now()
);

alter table lead_enrichments enable row level security;

create policy "anon_all" on lead_enrichments
  for all to anon
  using (true)
  with check (true);
