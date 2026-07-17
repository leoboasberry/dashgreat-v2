import { useState, useEffect, useRef } from 'react'
import { loadRemoteSetting, saveRemoteSetting } from '../api/supabase'

const STORAGE_KEY = 'gp_excluded_utms'
const DEBOUNCE_MS = 500

function loadLocal(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function useExcludedUtms() {
  const [excluded, setExcluded] = useState<string[]>(loadLocal)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadRemoteSetting<string[]>('excluded_utms').then((remote) => {
      if (remote) {
        setExcluded(remote)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remote))
      }
    })
  }, [])

  function updateExcluded(next: string[]) {
    setExcluded(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      saveRemoteSetting('excluded_utms', next)
    }, DEBOUNCE_MS)
  }

  return { excluded, updateExcluded }
}
