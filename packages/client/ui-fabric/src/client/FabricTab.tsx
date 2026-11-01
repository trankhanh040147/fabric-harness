/** Compact Fabric worker tab for the right sidebar. */
import { useCallback, useEffect, useState } from 'react'

interface TabWorker {
  readonly target: string
  readonly liveness: string
  readonly busy: number
  readonly replicas: number
}

interface TabStatus {
  readonly enabled: boolean
  readonly connected: boolean
  readonly dashboardReachable: boolean
  readonly workers: readonly TabWorker[]
}

function livenessColor(liveness: string): string {
  if (liveness === 'up' || liveness === 'live') return '#3fb950'
  if (liveness === 'busy') return '#d29922'
  if (liveness === 'down') return '#f85149'
  return '#8b949e'
}

/**
 * @param _props - right-sidebar tab runtime props; the tab reads the host surface directly.
 * @returns compact worker roster with the engine toggle.
 */
export function FabricTab() {
  const [status, setStatus] = useState<TabStatus | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/fabric/status', { credentials: 'same-origin' })
      if (response.ok) setStatus(await response.json() as TabStatus)
    } catch {
      // The tab keeps the previous snapshot and the page reports failures.
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => { void load() }, 4_000)
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
      if (response.ok) setStatus(await response.json() as TabStatus)
    } finally {
      setBusy(false)
    }
  }, [status])

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong>Workers</strong>
        <button type="button" disabled={busy || status === undefined} onClick={() => { void toggle() }} style={{ padding: '2px 10px', borderRadius: 999, cursor: 'pointer' }}>
          {status?.enabled === true ? 'Engine on' : 'Engine off'}
        </button>
      </div>
      <div style={{ opacity: 0.7, fontSize: 12 }}>
        MCP {status?.connected === true ? 'connected' : 'disconnected'} · dashboard {status?.dashboardReachable === true ? 'up' : 'down'}
      </div>
      {(status?.workers.length ?? 0) === 0 && <div style={{ opacity: 0.7 }}>No workers reported.</div>}
      {status?.workers.map(worker => (
        <div key={worker.target} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: livenessColor(worker.liveness), display: 'inline-block' }} />
          <span style={{ flex: 1 }}>{worker.target}</span>
          <span style={{ opacity: 0.65 }}>{worker.liveness} · {worker.busy}/{worker.replicas}</span>
        </div>
      ))}
    </div>
  )
}
