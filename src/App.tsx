import { useState } from 'react'
import { RefreshCw, LogOut, Clock, AlertCircle, Loader2, Trash2 } from 'lucide-react'
import type { Config } from './types/greatpages'
import { useDashboard } from './hooks/useDashboard'
import ConfigScreen from './components/ConfigScreen'
import LoginScreen from './components/LoginScreen'
import MetricCard from './components/MetricCard'
import PageRow from './components/PageRow'
import SummaryChart from './components/SummaryChart'
import CampaignsSection from './components/campaigns/CampaignsSection'
import ConversionsSection from './components/conversions/ConversionsSection'
import LeadsSection from './components/leads/LeadsSection'
import BackfillSection from './components/backfill/BackfillSection'
import AudiencesSection from './components/audiences/AudiencesSection'
import { clearAllCache } from './api/cache'

const STORAGE_KEY = 'gp_config'
const AUTH_KEY = 'gp_password_hash'
const SESSION_KEY = 'gp_session'

// Credentials baked in at build time from Railway env vars (permanent across all browsers)
const ENV_CONFIG: Config | null =
  import.meta.env.VITE_GP_TOKEN
    ? {
        token: import.meta.env.VITE_GP_TOKEN as string,
        id_usuario: import.meta.env.VITE_GP_USER_ID as string,
        id_projeto: import.meta.env.VITE_GP_PROJECT_ID as string,
        cacheTtlMinutes: 10,
      }
    : null

// Password stored as plain text env var (VITE_GP_PASSWORD) or as SHA-256 hash in localStorage
const ENV_PASSWORD: string = (import.meta.env.VITE_GP_PASSWORD as string) ?? ''

type Tab = 'overview' | 'campaigns' | 'conversions' | 'leads' | 'backfill' | 'audiences'

function loadConfig(): Config | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function App() {
  // In env-var mode the config is always available; otherwise use localStorage
  const [localConfig, setLocalConfig] = useState<Config | null>(loadConfig)
  const config = ENV_CONFIG ?? localConfig

  const [passwordHash, setPasswordHash] = useState<string | null>(() => localStorage.getItem(AUTH_KEY))
  const [authenticated, setAuthenticated] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')
  const [activeTab, setActiveTab] = useState<Tab>('conversions')
  const { pages, loading, error, cacheAgeSeconds, lastRefreshed, refresh } = useDashboard(
    config && authenticated ? config : null,
  )

  function handleFirstSetup(c: Config, hash: string) {
    clearAllCache()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
    localStorage.setItem(AUTH_KEY, hash)
    sessionStorage.setItem(SESSION_KEY, '1')
    setLocalConfig(c)
    setPasswordHash(hash)
    setAuthenticated(true)
  }

  function handleLogin() {
    sessionStorage.setItem(SESSION_KEY, '1')
    setAuthenticated(true)
  }

  function handleLogout() {
    sessionStorage.removeItem(SESSION_KEY)
    setAuthenticated(false)
  }

  function handleReset() {
    clearAllCache()
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(AUTH_KEY)
    sessionStorage.removeItem(SESSION_KEY)
    setLocalConfig(null)
    setPasswordHash(null)
    setAuthenticated(false)
  }

  // Env-var mode: config is always available, use plain-text password comparison
  if (ENV_CONFIG) {
    if (!authenticated) {
      return <LoginScreen envPassword={ENV_PASSWORD} onLogin={handleLogin} />
    }
  } else {
    // Local/fallback mode: credentials + password stored in localStorage
    if (!passwordHash) {
      return <ConfigScreen existingConfig={localConfig} onSave={handleFirstSetup} />
    }
    if (!authenticated) {
      return <LoginScreen storedHash={passwordHash} onLogin={handleLogin} onReset={handleReset} />
    }
  }

  // Aggregate totals
  const totals = pages.reduce(
    (acc, p) => ({
      visitas: acc.visitas + p.summary.visitas.total,
      visitas7d: acc.visitas7d + p.summary.visitas['7_dias'],
      conversoes: acc.conversoes + p.summary.conversoes.total,
      conversoes7d: acc.conversoes7d + p.summary.conversoes['7_dias'],
      leads: acc.leads + (p.leads?.retorno?.quantidade ?? 0),
    }),
    { visitas: 0, visitas7d: 0, conversoes: 0, conversoes7d: 0, leads: 0 },
  )

  const taxaGeral =
    totals.visitas > 0 ? ((totals.conversoes / totals.visitas) * 100).toFixed(1) : '0.0'

  const cacheLabel =
    cacheAgeSeconds !== null
      ? cacheAgeSeconds < 60
        ? `Cache: ${cacheAgeSeconds}s atrás`
        : `Cache: ${Math.floor(cacheAgeSeconds / 60)}min atrás`
      : null

  const loadingLeads = pages.some((p) => p.loadingLeads)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/berry-logo.png" alt="Berry" className="h-8 w-auto object-contain" />
            <span className="text-[10px] text-gray-400 font-medium tracking-wide">Controle Geral Performance Berry - Consultoria</span>
          </div>

          <div className="flex items-center gap-2">
            {cacheLabel && (
              <span className="hidden sm:flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
                <Clock size={11} /> {cacheLabel}
              </span>
            )}
            {lastRefreshed && (
              <span className="hidden md:flex items-center gap-1 text-xs text-gray-400">
                Atualizado: {lastRefreshed.toLocaleTimeString('pt-BR')}
              </span>
            )}
            <button
              onClick={() => { clearAllCache(); window.location.reload() }}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
              title="Limpar cache"
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">Limpar cache</span>
            </button>
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1.5 text-sm text-[#0D2F9F] hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Sair"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Tab bar — Conversões always shown; GP-dependent tabs appear once pages load */}
        <div className="px-4 sm:px-6 flex gap-1 border-t border-gray-100">
          <TabButton active={activeTab === 'conversions'} onClick={() => setActiveTab('conversions')}>
            Conversões
          </TabButton>
          {pages.length > 0 && (
            <>
              <TabButton active={activeTab === 'leads'} onClick={() => setActiveTab('leads')}>
                Leads do Dia
              </TabButton>
              <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
                Visão Geral
              </TabButton>
              <TabButton
                active={activeTab === 'campaigns'}
                onClick={() => setActiveTab('campaigns')}
                loading={loadingLeads}
              >
                Origem &amp; Campanhas
              </TabButton>
            </>
          )}
          <TabButton active={activeTab === 'backfill'} onClick={() => setActiveTab('backfill')}>
            Backfill CRM
          </TabButton>
          <TabButton active={activeTab === 'audiences'} onClick={() => setActiveTab('audiences')}>
            Audiências Meta
          </TabButton>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-6 flex flex-col gap-6">
        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Global loading state — only show spinner when on a GP-dependent tab */}
        {loading && pages.length === 0 && activeTab !== 'conversions' && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
            <Loader2 size={32} className="animate-spin text-blue-400" />
            <span>Carregando dados das páginas...</span>
          </div>
        )}

        {/* ── Conversões — always available, even if GreatPages is down ── */}
        {activeTab === 'conversions' && <ConversionsSection pages={pages} />}

        {/* ── Backfill CRM — always available ── */}
        {activeTab === 'backfill' && <BackfillSection pages={pages} />}

        {/* ── Audiências Meta — always available ── */}
        {activeTab === 'audiences' && <AudiencesSection pages={pages} />}

        {pages.length > 0 && (
          <>
            {/* ── Visão Geral ── */}
            {activeTab === 'overview' && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <MetricCard
                    label="Visitas totais"
                    value={totals.visitas.toLocaleString('pt-BR')}
                    sub={`${totals.visitas7d.toLocaleString('pt-BR')} nos últimos 7 dias`}
                    color="text-[#0D2F9F]"
                  />
                  <MetricCard
                    label="Conversões"
                    value={totals.conversoes.toLocaleString('pt-BR')}
                    sub={`${totals.conversoes7d.toLocaleString('pt-BR')} nos últimos 7 dias`}
                    color="text-emerald-600"
                  />
                  <MetricCard
                    label="Taxa de conversão"
                    value={`${taxaGeral}%`}
                    sub="Total acumulado"
                    color="text-orange-500"
                  />
                  <MetricCard
                    label="Leads gerados"
                    value={totals.leads.toLocaleString('pt-BR')}
                    sub={`em ${pages.length} páginas`}
                    color="text-purple-600"
                  />
                </div>

                <SummaryChart pages={pages} />

                <div>
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Páginas ({pages.length})
                  </h2>
                  <div className="flex flex-col gap-3">
                    {pages.map((p) => (
                      <PageRow key={p.summary.id} data={p} />
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Leads do Dia ── */}
            {activeTab === 'leads' && <LeadsSection pages={pages} />}

            {/* ── Origem & Campanhas ── */}
            {activeTab === 'campaigns' && (
              <>
                {loadingLeads && (
                  <div className="flex items-center gap-2 text-sm text-gray-400 bg-amber-50 border border-amber-100 px-4 py-3 rounded-xl">
                    <Loader2 size={14} className="animate-spin text-amber-500 shrink-0" />
                    Carregando leads de algumas páginas... os dados abaixo podem estar incompletos.
                  </div>
                )}
                <CampaignsSection pages={pages} />
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
  loading,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-[#0D2F9F] text-[#0D2F9F]'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
      {loading && <Loader2 size={11} className="animate-spin text-gray-400" />}
    </button>
  )
}
