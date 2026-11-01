/** Settings section: Fabric engine switch and a compact worker summary. */
import { useCallback, useEffect, useState } from 'react'

interface SettingsStatus {
  readonly enabled: boolean
  readonly connected: boolean
  readonly dashboardReachable: boolean
  readonly workers: readonly { readonly target: string; readonly liveness: string }[]
  readonly models: readonly { readonly id: string }[]
}

const card = { border: '1px solid rgba(128,128,128,0.25)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column' as const, gap: 12 }
const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }

/**
 * @returns the Fabric settings section body.
 */
export function FabricSettingsSection() {
  const [status, setStatus] = useState<SettingsStatus | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/fabric/status', { credentials: 'same-origin' })
      if (response.ok) setStatus(await response.json() as SettingsStatus)
    } catch {
      // The page and tab report failures; the settings card keeps its last snapshot.
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => { void load() }, 5_000)
    return () => { clearInterval(timer) }
  }, [load])

  const toggle = useCallback(async (): Promise<void> => {
    if (status === undefined) return
    setBusy(true)
    try {
      const response = await fetch('/fabric/engine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !status.enabled }),
      })
      if (response.ok) setStatus(await response.json() as SettingsStatus)
    } finally {
      setBusy(false)
    }
  }, [status])

  const live = (status?.workers ?? []).filter(worker => worker.liveness === 'up' || worker.liveness === 'live').length
  return (
    <div style={card}>
      <div style={row}>
        <div>
          <div style={{ fontWeight: 600 }}>Fabric engine</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
            Route this Session&apos;s model calls to agent-fabric peers. Off keeps DeepSeek only.
          </div>
        </div>
        <button type="button" disabled={busy || status === undefined} onClick={() => { void toggle() }} style={{ padding: '6px 14px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {status?.enabled === true ? 'Turn off' : 'Turn on'}
        </button>
      </div>
      <div style={{ fontSize: 12, opacity: 0.75 }}>
        MCP {status?.connected === true ? 'connected' : 'disconnected'} · dashboard {status?.dashboardReachable === true ? 'up' : 'down'} · {live}/{status?.workers.length ?? 0} workers live · {status?.models.length ?? 0} peer models
      </div>
    </div>
  )
}
