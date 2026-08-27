/**
 * CRUD para o módulo de Controle de Testes.
 * Acesso via PostgREST (mesmo padrão de supabase.ts) — sem o JS SDK.
 */

function getSupabase() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !key) throw new Error('Supabase env vars não configuradas')
  return { url, key }
}

function headers(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

async function postgrest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { url, key } = getSupabase()
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers(key), ...((options.headers as Record<string, string>) ?? {}) },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PostgREST ${res.status}: ${text.slice(0, 300)}`)
  }
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) return res.json() as Promise<T>
  return null as unknown as T
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Test {
  id: string
  title: string
  hypothesis: string | null
  decision_metric: string | null
  account: 'principal' | 'lab' | 'google' | 'bing' | 'linkedin' | 'tiktok' | 'openai'
  linked_codes: string[]
  category: string | null
  mode: 'finito' | 'continuo'
  status: 'verde' | 'amarelo' | 'laranja' | 'vermelho'
  approval_status: 'proposto' | 'aprovado' | 'pausado' | 'concluido'
  result: 'vitoria' | 'derrota' | 'inconclusivo' | null
  owner: string | null
  start_date: string | null
  target_end_date: string | null
  next_reminder_at: string | null
  parent_test_id: string | null
  budget_max: number | null
  created_at: string
  updated_at: string
}

export interface TestFlag {
  id: string
  label: string
  color: string | null
}

export interface TestFlagLink {
  test_id: string
  flag_id: string
  added_at: string
}

export type ActivityType =
  | 'comment'
  | 'attachment'
  | 'approval'
  | 'flag_added'
  | 'flag_removed'
  | 'reminder_set'
  | 'paused'
  | 'reactivated'
  | 'status_change'
  | 'concluded'

export interface TestActivity {
  id: string
  test_id: string
  activity_type: ActivityType
  author: string | null
  text: string | null
  attachment_url: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

// ── Tests CRUD ────────────────────────────────────────────────────────────────

export async function fetchTests(): Promise<Test[]> {
  return postgrest<Test[]>('tests?order=created_at.desc&select=*')
}

export async function fetchTest(id: string): Promise<Test> {
  const rows = await postgrest<Test[]>(`tests?id=eq.${id}&select=*`)
  return rows[0]
}

export async function createTest(data: Omit<Test, 'id' | 'created_at' | 'updated_at'>): Promise<Test> {
  const rows = await postgrest<Test[]>('tests', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return rows[0]
}

export async function updateTest(
  id: string,
  data: Partial<Omit<Test, 'id' | 'created_at'>>,
): Promise<Test> {
  const rows = await postgrest<Test[]>(`tests?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
  })
  return rows[0]
}

// ── Flags ─────────────────────────────────────────────────────────────────────

export async function fetchFlags(): Promise<TestFlag[]> {
  return postgrest<TestFlag[]>('test_flags?order=label.asc&select=*')
}

export async function createFlag(label: string, color?: string): Promise<TestFlag> {
  const rows = await postgrest<TestFlag[]>('test_flags', {
    method: 'POST',
    body: JSON.stringify({ label, color: color ?? null }),
  })
  return rows[0]
}

// ── Flag links ────────────────────────────────────────────────────────────────

export async function fetchFlagLinks(testId: string): Promise<TestFlagLink[]> {
  return postgrest<TestFlagLink[]>(
    `test_flag_links?test_id=eq.${testId}&select=*`,
  )
}

export async function fetchAllFlagLinks(): Promise<TestFlagLink[]> {
  return postgrest<TestFlagLink[]>('test_flag_links?select=*')
}

export async function addFlagLink(testId: string, flagId: string): Promise<void> {
  await postgrest<null>('test_flag_links', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' } as never,
    body: JSON.stringify({ test_id: testId, flag_id: flagId }),
  })
}

export async function removeFlagLink(testId: string, flagId: string): Promise<void> {
  await postgrest<null>(
    `test_flag_links?test_id=eq.${testId}&flag_id=eq.${flagId}`,
    { method: 'DELETE', headers: { Prefer: 'return=minimal' } as never },
  )
}

// ── Activity ──────────────────────────────────────────────────────────────────

export async function fetchActivity(testId: string): Promise<TestActivity[]> {
  return postgrest<TestActivity[]>(
    `test_activity?test_id=eq.${testId}&order=created_at.desc&select=*`,
  )
}

export async function insertActivity(
  data: Omit<TestActivity, 'id' | 'created_at'>,
): Promise<TestActivity> {
  const rows = await postgrest<TestActivity[]>('test_activity', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return rows[0]
}

// Variante que aceita created_at explícito — usada na importação em lote para preservar histórico
export async function insertActivityWithDate(
  data: Omit<TestActivity, 'id'>,
): Promise<TestActivity> {
  const rows = await postgrest<TestActivity[]>('test_activity', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return rows[0]
}

// ── Storage upload ────────────────────────────────────────────────────────────

export async function uploadAttachment(file: File, testId: string): Promise<string> {
  const { url, key } = getSupabase()
  const path = `tests/${testId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const res = await fetch(`${url}/storage/v1/object/test-attachments/${path}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Upload falhou ${res.status}: ${text.slice(0, 200)}`)
  }

  return `${url}/storage/v1/object/public/test-attachments/${path}`
}

// ── Compound actions (update test + insert activity in one call) ───────────────

export async function approveTest(testId: string, author: string): Promise<void> {
  await Promise.all([
    updateTest(testId, { approval_status: 'aprovado' }),
    insertActivity({ test_id: testId, activity_type: 'approval', author, text: null, attachment_url: null, metadata: null }),
  ])
}

export async function pauseTest(testId: string, author: string): Promise<void> {
  await Promise.all([
    updateTest(testId, { approval_status: 'pausado' }),
    insertActivity({ test_id: testId, activity_type: 'paused', author, text: null, attachment_url: null, metadata: null }),
  ])
}

export async function reactivateTest(testId: string, author: string): Promise<void> {
  await Promise.all([
    updateTest(testId, { approval_status: 'aprovado' }),
    insertActivity({ test_id: testId, activity_type: 'reactivated', author, text: null, attachment_url: null, metadata: null }),
  ])
}

export async function changeTestStatus(
  testId: string,
  from: Test['status'],
  to: Test['status'],
  author: string,
): Promise<void> {
  await Promise.all([
    updateTest(testId, { status: to }),
    insertActivity({
      test_id: testId,
      activity_type: 'status_change',
      author,
      text: null,
      attachment_url: null,
      metadata: { from, to },
    }),
  ])
}

export async function concludeTest(
  testId: string,
  result: 'vitoria' | 'derrota' | 'inconclusivo',
  author: string,
): Promise<void> {
  await Promise.all([
    updateTest(testId, { approval_status: 'concluido', result }),
    insertActivity({
      test_id: testId,
      activity_type: 'concluded',
      author,
      text: null,
      attachment_url: null,
      metadata: { result },
    }),
  ])
}

export async function deleteTest(id: string): Promise<void> {
  await postgrest<null>(`tests?id=eq.${id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' } as never,
  })
}

export async function setReminder(
  testId: string,
  at: string,
  author: string,
): Promise<void> {
  await Promise.all([
    updateTest(testId, { next_reminder_at: at }),
    insertActivity({
      test_id: testId,
      activity_type: 'reminder_set',
      author,
      text: null,
      attachment_url: null,
      metadata: { next_reminder_at: at },
    }),
  ])
}
