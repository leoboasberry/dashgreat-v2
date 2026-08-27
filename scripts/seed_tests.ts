/**
 * Seed script — 5 testes da reunião de 26/08/2026
 * Rodar localmente com: npx tsx scripts/seed_tests.ts
 * Requer: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env
 */

import 'dotenv/config'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env')
  process.exit(1)
}

const BASE = `${SUPABASE_URL}/rest/v1`
const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

interface Inserted { id: string }

// ── 1. Garantir que as flags padrão existem ────────────────────────────────────

const DEFAULT_FLAGS = [
  { label: 'Aguardando validação', color: 'warning' },
  { label: 'Bloqueio externo', color: 'danger' },
  { label: 'Revisar amanhã', color: 'accent' },
  { label: 'Aguardando criativo', color: 'warning' },
  { label: 'Sem dados suficientes', color: 'warning' },
  { label: 'Depende de aprovação', color: 'accent' },
]

async function ensureFlags(): Promise<Record<string, string>> {
  // upsert on label unique constraint
  const rows = await post<Array<{ id: string; label: string }>>(
    'test_flags?on_conflict=label',
    DEFAULT_FLAGS.map(({ label, color }) => ({ label, color })),
  )
  return Object.fromEntries(rows.map((r) => [r.label, r.id]))
}

// ── 2. Testes seed ─────────────────────────────────────────────────────────────

async function seed() {
  console.log('Garantindo flags padrão...')
  const flagIds = await ensureFlags()
  console.log('Flags:', Object.keys(flagIds).join(', '))

  const seeds = [
    // 1. Evento MQL como otimização
    {
      test: {
        title: 'Evento MQL como otimização',
        hypothesis: 'Usar evento MQL como sinal de otimização no Meta reduz o CPMql em comparação ao uso de leads como evento de campanha.',
        decision_metric: 'CPMql',
        account: 'principal' as const,
        linked_codes: ['F177', 'F175'],
        category: 'Otimização de campanha',
        mode: 'finito' as const,
        status: 'amarelo' as const,
        approval_status: 'aprovado' as const,
        result: null,
        owner: 'Leo',
        start_date: '2026-08-01',
        target_end_date: '2026-09-01',
        next_reminder_at: null,
        parent_test_id: null,
      },
      flagLabels: ['Aguardando validação'],
      activities: [
        { activity_type: 'approval', author: 'Leo', text: 'Teste aprovado para rodar', metadata: null },
        { activity_type: 'comment', author: 'Leo', text: 'F177 é a versão com MQL como evento, F175 é o controle com leads.', metadata: null },
      ],
    },

    // 2. Formulário simplificado 8→5 campos
    {
      test: {
        title: 'Formulário simplificado: 8 → 5 campos',
        hypothesis: 'Reduzir o formulário de 8 para 5 campos aumenta a taxa de conversão de visitante para lead sem comprometer a qualidade dos MQLs.',
        decision_metric: 'Taxa de conversão visitante→lead e CPMql',
        account: 'principal' as const,
        linked_codes: ['financial-c'],
        category: 'Landing page',
        mode: 'finito' as const,
        status: 'verde' as const,
        approval_status: 'aprovado' as const,
        result: null,
        owner: 'Leo',
        start_date: '2026-08-15',
        target_end_date: '2026-09-15',
        next_reminder_at: null,
        parent_test_id: null,
      },
      flagLabels: [],
      activities: [
        { activity_type: 'approval', author: 'Leo', text: 'Aprovado — LP com formulário reduzido live.', metadata: null },
      ],
    },

    // 3. Lookalike F003 compartilhado
    {
      test: {
        title: 'Lookalike F003 compartilhado entre contas',
        hypothesis: 'Usar o público lookalike gerado na conta principal (F003) na conta lab melhora a entrega inicial e reduz o CPC.',
        decision_metric: 'CPC e CPMql',
        account: 'lab' as const,
        linked_codes: ['F003C1'],
        category: 'Público',
        mode: 'finito' as const,
        status: 'amarelo' as const,
        approval_status: 'proposto' as const,
        result: null,
        owner: 'Leo',
        start_date: null,
        target_end_date: null,
        next_reminder_at: null,
        parent_test_id: null,
      },
      flagLabels: ['Aguardando validação'],
      activities: [
        { activity_type: 'comment', author: 'Leo', text: 'Aguardando validação de que o compartilhamento de público entre contas está funcionando antes de aprovar.', metadata: null },
      ],
    },

    // 4. Campanha segmento Indústria
    {
      test: {
        title: 'Campanha segmentada para Indústria',
        hypothesis: 'Uma campanha dedicada ao segmento Indústria com criativos e copy específicos gera CPMql menor do que a campanha geral.',
        decision_metric: 'CPMql',
        account: 'principal' as const,
        linked_codes: [],
        category: 'Segmentação',
        mode: 'finito' as const,
        status: 'laranja' as const,
        approval_status: 'proposto' as const,
        result: null,
        owner: 'Leo',
        start_date: null,
        target_end_date: null,
        next_reminder_at: null,
        parent_test_id: null,
      },
      flagLabels: ['Aguardando criativo'],
      activities: [
        { activity_type: 'comment', author: 'Leo', text: 'Aguardando criativos específicos de Indústria antes de subir a campanha.', metadata: null },
      ],
    },

    // 5. OpenAI Ads — reformular copy
    {
      test: {
        title: 'OpenAI Ads — reformular copy',
        hypothesis: 'Reformular o copy dos anúncios explorando autoridade de IA (OpenAI) aumenta CTR e reduz CPC no canal novo.',
        decision_metric: 'CTR e CPC',
        account: 'principal' as const,
        linked_codes: [],
        category: 'Copy',
        mode: 'continuo' as const,
        status: 'vermelho' as const,
        approval_status: 'proposto' as const,
        result: null,
        owner: 'Leo',
        start_date: null,
        target_end_date: null,
        next_reminder_at: null,
        parent_test_id: null,
      },
      flagLabels: ['Bloqueio externo'],
      activities: [
        { activity_type: 'comment', author: 'Leo', text: 'Canal OpenAI Ads ainda em fase de acesso beta — bloqueio externo.', metadata: null },
      ],
    },
  ]

  for (const { test, flagLabels, activities } of seeds) {
    console.log(`\nCriando: ${test.title}`)
    const [inserted] = await post<Inserted[]>('tests', test)

    // Flag links
    for (const label of flagLabels) {
      const flagId = flagIds[label]
      if (!flagId) { console.warn(`Flag não encontrada: ${label}`); continue }
      await post('test_flag_links', { test_id: inserted.id, flag_id: flagId })
    }

    // Activities (oldest first — insert in order, they'll sort by created_at)
    for (const act of [...activities].reverse()) {
      await post('test_activity', { ...act, test_id: inserted.id })
    }

    console.log(`  id: ${inserted.id}`)
  }

  console.log('\nSeed concluído.')
}

seed().catch((e) => { console.error(e); process.exit(1) })
