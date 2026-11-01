/** Fabric page: engine toolbar plus the embedded agent-fabric operations cockpit. */
import { useCallback, useEffect, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

interface FabricStatus {
  readonly enabled: boolean
  readonly connected: boolean
  readonly dashboardReachable: boolean
  readonly dashboardUrl: string
  readonly workers: readonly { readonly target: string; readonly liveness: string }[]
}

const COCKPIT_URL = '/fabric/app/'

const pageStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 10,
  height: '100%',
  padding: '10px 14px 14px',
  minHeight: 0,
}
const toolbarStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap' as const,
  border: '1px solid color-mix(in srgb, currentColor 16%, transparent)',
  borderRadius: 10,
  padding: '8px 12px',
}
const controlStyle = {
  padding: '4px 12px',
  borderRadius: 8,
  border: '1px solid color-mix(in srgb, currentColor 25%, transparent)',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 13,
}
const dotStyle = (color: string) => ({ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' })

function livenessColor(liveness: string): string {
  if (liveness === 'up' || liveness === 'live' || liveness === 'busy') return '#3fb950'
  if (liveness === 'down') return '#f85149'
  return '#8b949e'
}

/**
 * @param _props - the main-panel slot runtime props; the page owns its data.
 * @returns the Fabric workspace page.
 */
export function FabricPage(_props: PropsRuntime<'main'>) {
  const [status, setStatus] = useState<FabricStatus | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [generation, setGeneration] = useState(0)
  const [frameLoaded, setFrameLoaded] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/fabric/status', { credentials: 'same-origin' })
      if (response.ok) setStatus(await response.json() as FabricStatus)
    } catch {
      // The toolbar keeps the last snapshot; the cockpit reports its own failures.
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => { void load() }, 8_000)
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
      if (response.ok) setStatus(await response.json() as FabricStatus)
    } finally {
      setBusy(false)
    }
  }, [status])

  const live = (status?.workers ?? []).filter(worker => livenessColor(worker.liveness) === '#3fb950')
  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', marginRight: 8 }}>
          <strong style={{ fontSize: 16 }}>Fabric</strong>
          <span style={{ fontSize: 12, opacity: 0.7 }}>agent-fabric operations cockpit</span>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={dotStyle(status?.enabled === true ? '#3fb950' : '#8b949e')} /> engine {status?.enabled === true ? 'on' : 'off'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={dotStyle(status?.connected === true ? '#3fb950' : '#f85149')} /> MCP {status?.connected === true ? 'connected' : 'disconnected'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={dotStyle(status?.dashboardReachable === true ? '#3fb950' : '#f85149')} /> dashboard {status?.dashboardReachable === true ? 'up' : 'down'}
        </span>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{live.length}/{status?.workers.length ?? 0} workers live</span>
        <span style={{ flex: 1 }} />
        <button type="button" disabled={busy || status === undefined} onClick={() => { void toggle() }} style={controlStyle}>
          {status?.enabled === true ? 'Turn engine off' : 'Turn engine on'}
        </button>
        <button type="button" onClick={() => { setFrameLoaded(false); setGeneration(value => value + 1) }} style={controlStyle}>
          Reload cockpit
        </button>
        <a href={COCKPIT_URL} target="_blank" rel="noreferrer" style={{ ...controlStyle, textDecoration: 'none' }}>
          Open in new tab
        </a>
      </div>

      {status?.dashboardReachable === false && (
        <div style={{ fontSize: 13, color: '#d29922' }}>
          The operations dashboard is not running. Start it with `node src/dashboard/server.ts` from the agent-fabric
          repository, or set `FABRIC_DASHBOARD_ENTRY` so Fabric Harness can start it automatically.
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, border: '1px solid color-mix(in srgb, currentColor 16%, transparent)', borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
        {!frameLoaded && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 13, opacity: 0.7 }}>Loading cockpit…</div>}
        <iframe
          key={generation}
          src={COCKPIT_URL}
          title="agent-fabric operations cockpit"
          onLoad={() => { setFrameLoaded(true) }}
          style={{ width: '100%', height: '100%', border: 0, display: 'block', background: '#070a12' }}
        />
      </div>
    </div>
  )
}
