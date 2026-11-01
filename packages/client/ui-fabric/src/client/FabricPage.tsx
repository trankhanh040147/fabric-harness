/** Fabric page: engine toggle, worker roster, KPI strip, and dashboard tables. */
import { useCallback, useEffect, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

interface FabricWorker {
  readonly target: string
  readonly liveness: string
  readonly busy: number
  readonly replicas: number
}

interface FabricStatus {
  readonly enabled: boolean
  readonly connected: boolean
  readonly provider: string
  readonly dashboardUrl: string
  readonly dashboardReachable: boolean
  readonly targets: readonly string[]
  readonly workers: readonly FabricWorker[]
  readonly models: readonly { readonly id: string; readonly name: string }[]
}

interface Overview {
  readonly tasks?: {
    readonly total?: number
    readonly completed?: number
    readonly failed?: number
    readonly running?: number
    readonly queued?: number
    readonly successRate7d?: number
  }
  readonly workflows?: number
  readonly usage?: {
    readonly costUsd?: number
    readonly promptTokens?: number
    readonly completionTokens?: number
    readonly tasksWithUsage?: number
  }
  readonly ledger?: { readonly runs?: { readonly active?: number } }
}

interface UsageRow {
  readonly target: string
  readonly tasks?: number
  readonly completed?: number
  readonly failed?: number
  readonly costUsd?: number
  readonly promptTokens?: number
  readonly completionTokens?: number
  readonly avgRunMs?: number
}

interface RoutingTarget {
  readonly target: string
  readonly profile?: {
    readonly displayName?: string
    readonly modelFamily?: string
    readonly contextWindowTokens?: number
    readonly sweBenchEstimatedPercent?: number
    readonly costTier?: string
    readonly speedTier?: string
  }
}

interface PoolWorker {
  readonly target?: string
  readonly state?: string
  readonly processAlive?: boolean
}

interface PoolStatus {
  readonly supervisor?: { readonly alive?: boolean; readonly state?: string; readonly effectiveTargets?: readonly string[] }
  readonly workers?: readonly PoolWorker[]
}

interface RunRow {
  readonly runId?: string
  readonly projectKey?: string
  readonly ownerHost?: string
  readonly status?: string
  readonly createdAt?: string
  readonly updatedAt?: string
}

const POLL_MS = 5_000

const pageStyle = { padding: 20, display: 'flex', flexDirection: 'column' as const, gap: 16, height: '100%', overflow: 'auto' }
const cardStyle = { border: '1px solid var(--dsh-border, #2b2b2b)', borderRadius: 10, padding: 14, background: 'var(--dsh-surface, #1d1d1d)' }
const rowStyle = { display: 'flex', alignItems: 'center', gap: 10 }
const thStyle = { textAlign: 'left' as const, padding: '4px 10px 4px 0', opacity: 0.65, fontWeight: 500 }
const tdStyle = { padding: '4px 10px 4px 0' }

function dot(color: string) {
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
}

function livenessColor(liveness: string): string {
  if (liveness === 'up' || liveness === 'live') return '#3fb950'
  if (liveness === 'busy') return '#d29922'
  if (liveness === 'down') return '#f85149'
  return '#8b949e'
}

function compact(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(n)
}

function money(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n) || n === 0) return '—'
  return `$${n.toFixed(2)}`
}

function duration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return '—'
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}m`
}

function pct(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function age(iso: string | undefined): string {
  if (iso === undefined) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  return duration(ms)
}

function kpi(label: string, value: string) {
  return (
    <div style={{ ...cardStyle, minWidth: 120, flex: '1 1 120px' }}>
      <div style={{ fontSize: 11, opacity: 0.65 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  )
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    const response = await fetch(`/fabric/dashboard?path=${encodeURIComponent(path)}`, { credentials: 'same-origin' })
    if (!response.ok) return undefined
    return await response.json() as T
  } catch {
    return undefined
  }
}

/**
 * @param _props - the main-panel slot runtime props; this page owns its data.
 * @returns the Fabric workspace page.
 */
export function FabricPage(_props: PropsRuntime<'main'>) {
  const [status, setStatus] = useState<FabricStatus | undefined>(undefined)
  const [overview, setOverview] = useState<Overview | undefined>(undefined)
  const [usage, setUsage] = useState<readonly UsageRow[]>([])
  const [routing, setRouting] = useState<readonly RoutingTarget[]>([])
  const [runs, setRuns] = useState<readonly RunRow[]>([])
  const [pool, setPool] = useState<PoolStatus | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [recommendTask, setRecommendTask] = useState('')
  const [recommend, setRecommend] = useState<string>('')

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/fabric/status', { credentials: 'same-origin' })
      if (!response.ok) throw new Error(`status ${response.status}`)
      setStatus(await response.json() as FabricStatus)
      setFailed(false)
    } catch {
      setFailed(true)
    }
    const [nextOverview, nextUsage, nextRouting, nextRuns, nextPool] = await Promise.all([
      readJson<Overview>('/overview'),
      readJson<{ byTarget?: readonly UsageRow[] }>('/usage?days=7'),
      readJson<{ targets?: readonly RoutingTarget[] }>('/routing'),
      readJson<{ runs?: readonly RunRow[] }>('/state/runs'),
      readJson<PoolStatus>('/pool-status'),
    ])
    if (nextOverview !== undefined) setOverview(nextOverview)
    if (nextUsage?.byTarget !== undefined) setUsage(nextUsage.byTarget)
    if (nextRouting?.targets !== undefined) setRouting(nextRouting.targets)
    if (nextRuns?.runs !== undefined) setRuns(nextRuns.runs.slice(0, 12))
    if (nextPool !== undefined) setPool(nextPool)
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => { void load() }, POLL_MS)
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

  const askRecommend = useCallback(async (): Promise<void> => {
    if (recommendTask.trim().length === 0) return
    const result = await readJson<unknown>(`/routing/recommend?task=${encodeURIComponent(recommendTask.trim())}`)
    setRecommend(result === undefined ? 'Recommendation request failed.' : JSON.stringify(result, null, 2))
  }, [recommendTask])

  const tasks = overview?.tasks
  return (
    <div style={pageStyle}>
      <div style={{ ...rowStyle, justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Fabric</h2>
          <div style={{ opacity: 0.7, fontSize: 13, marginTop: 4 }}>
            Route model calls to agent-fabric workers, and watch the workers behind them.
          </div>
        </div>
        <div style={rowStyle}>
          <button type="button" onClick={() => { void load() }} style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer' }}>Refresh</button>
        </div>
      </div>

      {failed && <div style={{ ...cardStyle, color: '#f85149' }}>Fabric status request failed.</div>}

      <div style={{ ...cardStyle, ...rowStyle, justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 600 }}>Fabric engine</div>
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>
            On: the model picker offers every peer as a model. Off: only DeepSeek models are available.
          </div>
        </div>
        <div style={rowStyle}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>{status?.enabled === true ? 'On' : 'Off'}</span>
          <button type="button" disabled={busy || status === undefined} onClick={() => { void toggle() }} style={{ padding: '6px 14px', borderRadius: 999, cursor: 'pointer' }}>
            {busy ? '…' : status?.enabled === true ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      </div>

      <div style={{ ...cardStyle, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
        <span style={rowStyle}>{dot(status?.connected === true ? '#3fb950' : '#f85149')} MCP {status?.connected === true ? 'connected' : 'disconnected'}</span>
        <span style={rowStyle}>{dot(status?.dashboardReachable === true ? '#3fb950' : '#8b949e')} Ops dashboard {status?.dashboardReachable === true ? 'reachable' : 'unreachable'}</span>
        <span style={{ opacity: 0.7 }}>{status?.dashboardUrl ?? ''}</span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {kpi('Tasks total', compact(tasks?.total))}
        {kpi('Success 7d', pct(tasks?.successRate7d))}
        {kpi('Completed', compact(tasks?.completed))}
        {kpi('Failed', compact(tasks?.failed))}
        {kpi('Active runs', compact(overview?.ledger?.runs?.active))}
        {kpi('Workflows', compact(overview?.workflows))}
        {kpi('Tokens (prompt/out)', `${compact(overview?.usage?.promptTokens)} / ${compact(overview?.usage?.completionTokens)}`)}
        {kpi('Cost (lifetime)', money(overview?.usage?.costUsd))}
      </div>

      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Workers</div>
        {(status?.workers.length ?? 0) === 0
          ? <div style={{ opacity: 0.7, fontSize: 13 }}>No workers reported yet. Start agent-fabric workers, then refresh.</div>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {status?.workers.map(worker => (
              <div key={worker.target} style={{ border: '1px solid var(--dsh-border, #2b2b2b)', borderRadius: 8, padding: 10 }}>
                <div style={rowStyle}>{dot(livenessColor(worker.liveness))}<strong>{worker.target}</strong></div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                  liveness: {worker.liveness} · busy: {worker.busy} · replicas: {worker.replicas}
                </div>
              </div>
            ))}
          </div>}
      </div>


      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Worker pool</div>
        <div style={{ ...rowStyle, fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
          {dot(pool?.supervisor?.alive === true ? '#3fb950' : '#f85149')}
          supervisor {pool?.supervisor?.state ?? 'unknown'}
          {pool?.supervisor?.effectiveTargets !== undefined
            ? ` · targets: ${pool.supervisor.effectiveTargets.join(', ')}`
            : ''}
        </div>
        {(pool?.workers?.length ?? 0) === 0
          ? <div style={{ opacity: 0.7, fontSize: 13 }}>Pool snapshot unavailable.</div>
          : <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
            {Object.entries(pool?.workers?.reduce<Record<string, { total: number; up: number; stale: number }>>((acc, worker) => {
              const target = worker.target ?? 'unknown'
              const entry = acc[target] ?? { total: 0, up: 0, stale: 0 }
              entry.total += 1
              if (worker.state === 'running' || worker.processAlive === true) entry.up += 1
              if (worker.state === 'stale') entry.stale += 1
              acc[target] = entry
              return acc
            }, {}) ?? {}).map(([target, counts]) => (
              <span key={target} style={{ border: '1px solid rgba(255,255,255,0.14)', borderRadius: 999, padding: '3px 10px' }}>
                {target}: {counts.up}/{counts.total} alive{counts.stale > 0 ? ` · ${counts.stale} stale` : ''}
              </span>
            ))}
          </div>}
      </div>

      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Usage by worker (last 7 days)</div>
        {usage.length === 0 ? <div style={{ opacity: 0.7, fontSize: 13 }}>No usage reported.</div> : (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Worker</th><th style={thStyle}>Tasks</th><th style={thStyle}>Done</th>
                <th style={thStyle}>Failed</th><th style={thStyle}>Avg run</th>
                <th style={thStyle}>Prompt tokens</th><th style={thStyle}>Completion</th><th style={thStyle}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {usage.map(row => (
                <tr key={row.target}>
                  <td style={tdStyle}><strong>{row.target}</strong></td>
                  <td style={tdStyle}>{compact(row.tasks)}</td>
                  <td style={tdStyle}>{compact(row.completed)}</td>
                  <td style={tdStyle}>{compact(row.failed)}</td>
                  <td style={tdStyle}>{duration(row.avgRunMs)}</td>
                  <td style={tdStyle}>{compact(row.promptTokens)}</td>
                  <td style={tdStyle}>{compact(row.completionTokens)}</td>
                  <td style={tdStyle}>{money(row.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Routing capability matrix</div>
        {routing.length === 0 ? <div style={{ opacity: 0.7, fontSize: 13 }}>Routing matrix unavailable.</div> : (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Target</th><th style={thStyle}>Model family</th><th style={thStyle}>Context</th>
                <th style={thStyle}>SWE-bench</th><th style={thStyle}>Cost</th><th style={thStyle}>Speed</th>
              </tr>
            </thead>
            <tbody>
              {routing.map(row => (
                <tr key={row.target}>
                  <td style={tdStyle}><strong>{row.profile?.displayName ?? row.target}</strong></td>
                  <td style={tdStyle}>{row.profile?.modelFamily ?? '—'}</td>
                  <td style={tdStyle}>{compact(row.profile?.contextWindowTokens)}</td>
                  <td style={tdStyle}>{row.profile?.sweBenchEstimatedPercent === undefined ? '—' : `${row.profile.sweBenchEstimatedPercent}%`}</td>
                  <td style={tdStyle}>{row.profile?.costTier ?? '—'}</td>
                  <td style={tdStyle}>{row.profile?.speedTier ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ ...rowStyle, marginTop: 12 }}>
          <input
            value={recommendTask}
            onChange={(event) => { setRecommendTask(event.target.value) }}
            placeholder="Describe a task to get a worker recommendation…"
            style={{ flex: 1, padding: '6px 10px', borderRadius: 8 }}
          />
          <button type="button" onClick={() => { void askRecommend() }} style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer' }}>Recommend</button>
        </div>
        {recommend.length > 0 && <pre style={{ margin: '10px 0 0', maxHeight: 220, overflow: 'auto', fontSize: 12 }}>{recommend}</pre>}
      </div>

      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Active runs</div>
        {runs.length === 0 ? <div style={{ opacity: 0.7, fontSize: 13 }}>No runs reported.</div> : (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Run</th><th style={thStyle}>Project</th><th style={thStyle}>Owner</th>
                <th style={thStyle}>Status</th><th style={thStyle}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(row => (
                <tr key={row.runId ?? `${row.projectKey}-${row.createdAt}`}>
                  <td style={tdStyle}>{row.runId?.slice(0, 16) ?? '—'}</td>
                  <td style={tdStyle}>{row.projectKey?.replace(/^path:/, '') ?? '—'}</td>
                  <td style={tdStyle}>{row.ownerHost ?? '—'}</td>
                  <td style={tdStyle}>{row.status ?? '—'}</td>
                  <td style={tdStyle}>{age(row.updatedAt ?? row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Models offered</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
          {(status?.models.length ?? 0) === 0
            ? <span style={{ opacity: 0.7 }}>No peer models while the engine is off.</span>
            : status?.models.map(model => (
              <span key={model.id} style={{ border: '1px solid var(--dsh-border, #2b2b2b)', borderRadius: 999, padding: '3px 10px' }}>{model.name}</span>
            ))}
        </div>
      </div>
    </div>
  )
}
