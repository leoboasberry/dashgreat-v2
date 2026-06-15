import type { AdMetrics } from './computeMetrics'

export interface CeaConfig {
  cpa_mql_teto: number       // max CPA MQL (R$) — default 500
  mql_sql_excelente: number  // excellent MQL→SQL % — default 55
  mql_sql_piso: number       // acceptable MQL→SQL % — default 30
  mql_sql_critico: number    // critical MQL→SQL % — default 15
  rr_ganho_piso: number      // min % RR→GANHO — default 25
  cea_teto: number           // max CEA ratio — default 1.5
  cea_excelente: number      // excellent CEA ratio — default 0.8
  ticket_medio: number       // average ticket (R$) — default 5000
}

export const DEFAULT_CEA_CONFIG: CeaConfig = {
  cpa_mql_teto: 500,
  mql_sql_excelente: 55,
  mql_sql_piso: 30,
  mql_sql_critico: 15,
  rr_ganho_piso: 25,
  cea_teto: 1.5,
  cea_excelente: 0.8,
  ticket_medio: 5000,
}

export type CeaBadgeType = 'green' | 'yellow' | 'orange' | 'red' | 'gray'

export interface CeaStatus {
  stage: 'VALIDACAO' | 'ESCALA'
  badge: string
  type: CeaBadgeType
  // Computed metrics for tooltip/modal
  cpaMql: number | null
  mqlSqlPct: number | null
  rrGanhoPct: number | null
  cea: number | null
  ticket: number | null
}

export function computeCEAStatus(ad: AdMetrics, config: CeaConfig): CeaStatus | null {
  // No spend = no badge
  if (ad.spend === 0) return null

  const stage: 'VALIDACAO' | 'ESCALA' = ad.meetings < 20 ? 'VALIDACAO' : 'ESCALA'

  const cpaMql = ad.mqls > 0 ? ad.spend / ad.mqls : null
  const mqlSqlPct = ad.mqls > 0 ? (ad.sqls / ad.mqls) * 100 : null
  const rrGanhoPct = ad.meetings > 0 ? (ad.won / ad.meetings) * 100 : null
  const ticket = ad.won > 0 && ad.mrr > 0 ? ad.mrr / ad.won : config.ticket_medio
  const cpa = ad.won > 0 ? ad.spend / ad.won : null
  const cea = cpa !== null ? cpa / ticket : null

  if (stage === 'VALIDACAO') {
    if (ad.mqls === 0) {
      return { stage, badge: 'SEM MQLs', type: 'gray', cpaMql, mqlSqlPct, rrGanhoPct, cea, ticket }
    }
    // Critical conversion rate
    if (mqlSqlPct !== null && mqlSqlPct < config.mql_sql_critico) {
      return { stage, badge: 'PAUSAR', type: 'red', cpaMql, mqlSqlPct, rrGanhoPct, cea, ticket }
    }
    // High CPA but excellent conversion — don't pause
    if (cpaMql !== null && cpaMql > config.cpa_mql_teto && mqlSqlPct !== null && mqlSqlPct >= config.mql_sql_excelente) {
      return { stage, badge: 'NAO PAUSAR', type: 'orange', cpaMql, mqlSqlPct, rrGanhoPct, cea, ticket }
    }
    // High CPA
    if (cpaMql !== null && cpaMql > config.cpa_mql_teto) {
      return { stage, badge: 'CPA ALTO', type: 'red', cpaMql, mqlSqlPct, rrGanhoPct, cea, ticket }
    }
    // Excellent conversion
    if (mqlSqlPct !== null && mqlSqlPct >= config.mql_sql_excelente) {
      return { stage, badge: 'APROVAR', type: 'green', cpaMql, mqlSqlPct, rrGanhoPct, cea, ticket }
    }
    // Acceptable conversion
    if (mqlSqlPct !== null && mqlSqlPct >= config.mql_sql_piso) {
      return { stage, badge: 'VALIDANDO', type: 'yellow', cpaMql, mqlSqlPct, rrGanhoPct, cea, ticket }
    }
    // Low conversion
    return { stage, badge: 'ATENCAO', type: 'orange', cpaMql, mqlSqlPct, rrGanhoPct, cea, ticket }
  }

  // ESCALA
  if (ad.won === 0) {
    // Has meetings but no wins
    if (mqlSqlPct !== null && mqlSqlPct >= config.mql_sql_excelente) {
      return { stage, badge: 'REVISAR CPA', type: 'yellow', cpaMql, mqlSqlPct, rrGanhoPct, cea, ticket }
    }
    return { stage, badge: 'PAUSAR', type: 'red', cpaMql, mqlSqlPct, rrGanhoPct, cea, ticket }
  }

  // CEA computed — check thresholds
  if (cea !== null && cea <= config.cea_excelente) {
    return { stage, badge: 'PROTEGIDA', type: 'green', cpaMql, mqlSqlPct, rrGanhoPct, cea, ticket }
  }
  if (cea !== null && cea <= config.cea_teto) {
    return { stage, badge: 'ESCALAR', type: 'green', cpaMql, mqlSqlPct, rrGanhoPct, cea, ticket }
  }
  // CEA above teto — anti-error rule
  if (mqlSqlPct !== null && mqlSqlPct >= config.mql_sql_excelente) {
    return { stage, badge: 'NAO PAUSAR', type: 'orange', cpaMql, mqlSqlPct, rrGanhoPct, cea, ticket }
  }
  // Bad RR→GANHO
  if (rrGanhoPct !== null && rrGanhoPct < config.rr_ganho_piso) {
    return { stage, badge: 'PAUSAR', type: 'red', cpaMql, mqlSqlPct, rrGanhoPct, cea, ticket }
  }
  return { stage, badge: 'REVISAR', type: 'yellow', cpaMql, mqlSqlPct, rrGanhoPct, cea, ticket }
}

export function ceaBadgeLabel(badge: string): string {
  const map: Record<string, string> = {
    'PAUSAR': '🚫 PAUSAR',
    'NAO PAUSAR': '⚠️ NÃO PAUSAR',
    'CPA ALTO': '🚨 CPA ALTO',
    'APROVAR': '✅ APROVAR',
    'VALIDANDO': '⚡ VALIDANDO',
    'ATENCAO': '⚠️ ATENÇÃO',
    'SEM MQLs': '📊 SEM MQLs',
    'PROTEGIDA': '🛡️ PROTEGIDA',
    'ESCALAR': '✅ ESCALAR',
    'REVISAR': '⚡ REVISAR',
    'REVISAR CPA': '⚡ REVISAR CPA',
  }
  return map[badge] ?? badge
}
