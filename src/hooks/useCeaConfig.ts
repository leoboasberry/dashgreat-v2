import { useState, useEffect } from 'react'
import { loadRemoteSetting, saveRemoteSetting } from '../api/supabase'
import { DEFAULT_CEA_CONFIG, type CeaConfig } from '../utils/cea'

const STORAGE_KEY = 'gp_cea_config'

function loadLocal(): CeaConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CEA_CONFIG
    return { ...DEFAULT_CEA_CONFIG, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_CEA_CONFIG
  }
}

export function useCeaConfig() {
  const [config, setConfig] = useState<CeaConfig>(loadLocal)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    loadRemoteSetting<CeaConfig>('cea_config').then((remote) => {
      if (remote) {
        const merged = { ...DEFAULT_CEA_CONFIG, ...remote }
        setConfig(merged)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
      }
    })
  }, [])

  async function saveConfig(next: CeaConfig) {
    setConfig(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setSyncing(true)
    await saveRemoteSetting('cea_config', next)
    setSyncing(false)
  }

  return { config, saveConfig, syncing }
}
