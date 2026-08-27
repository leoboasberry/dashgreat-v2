-- Módulo de Controle de Testes A/B — Berry Dashboard
-- Migration: 20260827000000_create_tests

-- ── tests ─────────────────────────────────────────────────────────────────────

create table if not exists tests (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  hypothesis        text,
  decision_metric   text,
  account           text not null default 'principal',   -- 'principal' | 'lab'
  linked_codes      text[] not null default '{}',        -- ex: ['F177', 'F177C2']
  category          text,                                -- criativo | público | evento/pixel | LP | orçamento | formulário | canal novo
  mode              text not null default 'finito',      -- 'finito' | 'continuo'
  status            text not null default 'verde',       -- 'verde' | 'amarelo' | 'laranja' | 'vermelho'
  approval_status   text not null default 'proposto',    -- 'proposto' | 'aprovado' | 'pausado' | 'concluido'
  result            text,                                -- 'vitoria' | 'derrota' | 'inconclusivo' | null
  owner             text,
  start_date        date,
  target_end_date   date,
  next_reminder_at  timestamptz,
  parent_test_id    uuid references tests(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table tests enable row level security;
create policy "anon_all" on tests for all to anon using (true) with check (true);

-- ── test_flags ────────────────────────────────────────────────────────────────

create table if not exists test_flags (
  id    uuid primary key default gen_random_uuid(),
  label text not null unique,
  color text  -- papel semântico: danger | warning | accent
);

alter table test_flags enable row level security;
create policy "anon_all" on test_flags for all to anon using (true) with check (true);

-- Flags padrão
insert into test_flags (label, color) values
  ('Aguardando validação',  'warning'),
  ('Bloqueio externo',      'danger'),
  ('Revisar amanhã',        'warning'),
  ('Aguardando criativo',   'accent'),
  ('Sem dados suficientes', 'warning'),
  ('Depende de aprovação',  'danger')
on conflict (label) do nothing;

-- ── test_flag_links ───────────────────────────────────────────────────────────

create table if not exists test_flag_links (
  test_id  uuid not null references tests(id) on delete cascade,
  flag_id  uuid not null references test_flags(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (test_id, flag_id)
);

alter table test_flag_links enable row level security;
create policy "anon_all" on test_flag_links for all to anon using (true) with check (true);

-- ── test_activity ─────────────────────────────────────────────────────────────
-- Feed unificado: comentário, print, aprovação, flag, lembrete, pausa, status

create table if not exists test_activity (
  id              uuid primary key default gen_random_uuid(),
  test_id         uuid not null references tests(id) on delete cascade,
  activity_type   text not null,  -- 'comment' | 'attachment' | 'approval' | 'flag_added' | 'flag_removed'
                                  -- | 'reminder_set' | 'paused' | 'reactivated' | 'status_change' | 'concluded'
  author          text,
  text            text,           -- obrigatório para 'comment'
  attachment_url  text,           -- URL pública do Supabase Storage para 'attachment'
  metadata        jsonb,          -- dados extras por tipo (ex: {from:'verde',to:'amarelo'} para status_change)
  created_at      timestamptz not null default now()
);

alter table test_activity enable row level security;
create policy "anon_all" on test_activity for all to anon using (true) with check (true);

-- ── Supabase Storage: bucket test-attachments ─────────────────────────────────

insert into storage.buckets (id, name, public)
  values ('test-attachments', 'test-attachments', true)
  on conflict (id) do nothing;

-- Política de leitura pública (bucket já é public, mas a policy é necessária)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'anon_read_test_attachments'
      and tablename  = 'objects'
      and schemaname = 'storage'
  ) then
    execute $pol$
      create policy "anon_read_test_attachments" on storage.objects
        for select to anon using (bucket_id = 'test-attachments')
    $pol$;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'anon_insert_test_attachments'
      and tablename  = 'objects'
      and schemaname = 'storage'
  ) then
    execute $pol$
      create policy "anon_insert_test_attachments" on storage.objects
        for insert to anon with check (bucket_id = 'test-attachments')
    $pol$;
  end if;
end $$;
