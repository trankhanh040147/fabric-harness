/**
 * Fabric Harness engine plugin: owns the agent-fabric MCP connection, exposes
 * worker status over a small same-origin HTTP surface, and registers the
 * `fabric` LLM provider route so a Session model can be a peer.
 * @module @deepseek-ai/dsh-fabric
 */

import { Service } from '@deepseek-ai/cordis'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { Config } from './config.ts'
import type { Config as FabricConfig } from './config.ts'
import { FabricAdapter } from './adapter.ts'
import { FabricMcpClient } from './mcp.ts'

/** One worker summary as the browser should see it. */
export interface FabricWorker {
  readonly target: string
  readonly liveness: string
  readonly busy: number
  readonly replicas: number
}

/** Browser-facing snapshot of the engine and its workers. */
export interface FabricStatus {
  readonly enabled: boolean
  readonly connected: boolean
  readonly provider: 'fabric'
  readonly dashboardUrl: string
  readonly dashboardReachable: boolean
  readonly targets: readonly string[]
  readonly workers: readonly FabricWorker[]
  readonly models: readonly { readonly id: string; readonly name: string }[]
}

/** peer_list callee row shape owned by agent-fabric; read defensively. */
interface PeerListRow {
  readonly target?: unknown
  readonly liveness?: unknown
  readonly busy?: unknown
  readonly replicas?: unknown
}

/** peer_get result shape; only the fields this engine consumes are typed. */
interface PeerTaskView {
  readonly terminal?: unknown
  readonly status?: unknown
  readonly outcome?: unknown
  readonly result?: unknown
}

const STATUS_PATH = '/fabric/status'
const ENGINE_PATH = '/fabric/engine'
const DASHBOARD_PATH = '/fabric/dashboard'
const DASHBOARD_PREFIXES = [
  '/health', '/workers', '/pool-status', '/overview', '/usage', '/routing',
  '/state', '/tasks', '/sessions', '/workflows', '/topology',
]

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

function isLoopback(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += buffer.byteLength
    if (size > 16_384) throw new Error('fabric: request body is too large')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

/** Strip the peer harness's fenced control envelope from a final result. */
function stripEnvelope(text: string): string {
  return text.replace(/```fabric-envelope[\s\S]*?```/g, '').trim()
}

/** Stable non-cryptographic key for peer idempotency. */
function stableKey(text: string): string {
  let hash = 5381
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0
  return hash.toString(36)
}

/** Map a terminal peer view to text or a classified failure. */
function settlePeerView(taskId: string, view: PeerTaskView): string {
  const status = typeof view.status === 'string' ? view.status : ''
  const result = typeof view.result === 'string' ? stripEnvelope(view.result) : ''
  if (status === 'COMPLETED' && result.length > 0) return result
  if (status === 'COMPLETED') return ''
  throw new Error(`fabric: peer task ${taskId} ended ${status || 'unknown'}${result.length > 0 ? `: ${result.slice(0, 500)}` : ''}`)
}

/**
 * Engine service registered as `ctx.fabric`; the browser half and the LLM
 * adapter both read the same live connection and toggle state.
 */
export default class Fabric extends Service {
  static inject = ['llm', 'webServer']
  static Config = Config

  private enabledValue: boolean
  private readonly client: FabricMcpClient
  private readonly dashboardUrl: string
  private readonly requestTimeoutMs: number
  private readonly pollIntervalMs: number
  private readonly fallbackTargets: readonly string[]
  private adapterDispose: (() => void) | undefined
  private targetCache: { at: number; targets: readonly string[] } = { at: 0, targets: [] }
  private emittedTargets: readonly string[] = []
  private readonly stateFile: string

  /**
   * @param ctx - host context carrying the LLM registry and the Web server.
   * @param config - resolved deployment policy.
   */
  constructor(ctx: ConstructorParameters<typeof Service>[0], config: FabricConfig) {
    super(ctx, 'fabric')
    this.stateFile = config.stateFile !== undefined && config.stateFile.length > 0
      ? config.stateFile
      : join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'fabric-engine.json')
    this.enabledValue = config.enabled !== false
    this.dashboardUrl = (config.dashboardUrl ?? 'http://127.0.0.1:8788').replace(/\/+$/, '')
    this.requestTimeoutMs = config.requestTimeoutMs ?? 600_000
    this.pollIntervalMs = config.pollIntervalMs ?? 2_000
    this.fallbackTargets = config.targets ?? []
    this.client = new FabricMcpClient({
      command: config.mcpCommand ?? 'node',
      args: config.mcpArgs ?? [],
      cwd: config.mcpCwd,
    })
    this.enabledValue = this.readPersistedEnabled() ?? this.enabledValue
    this.ctx.effect(() => () => {
      this.adapterDispose?.()
      this.client.dispose()
    }, 'fabric: engine disposal')
    this.registerAdapter()
    this.mountRoutes()
    void this.client.ensure().catch(() => undefined)
  }

  /** Whether the `fabric` provider route currently accepts requests. */
  get engineEnabled(): boolean {
    return this.enabledValue
  }

  /** Toggle the engine, re-registering the provider so model catalogs refresh. */
  setEnabled(enabled: boolean): void {
    if (this.enabledValue === enabled) return
    this.enabledValue = enabled
    this.persistEnabled(enabled)
    this.registerAdapter()
  }

  /** Read the persisted engine switch, or undefined when absent/invalid. */
  private readPersistedEnabled(): boolean | undefined {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.stateFile, 'utf8'))
      if (typeof parsed === 'object' && parsed !== null && 'enabled' in parsed) {
        const enabled = (parsed as { enabled?: unknown }).enabled
        return typeof enabled === 'boolean' ? enabled : undefined
      }
    } catch {
      // Missing or unreadable state keeps the configured default.
    }
    return undefined
  }

  /** Persist the engine switch; failure is non-fatal and reported once. */
  private persistEnabled(enabled: boolean): void {
    try {
      mkdirSync(dirname(this.stateFile), { recursive: true })
      writeFileSync(this.stateFile, `${JSON.stringify({ enabled, updatedAt: new Date().toISOString() }, null, 2)}\n`)
    } catch (error) {
      console.warn('[fabric] could not persist engine state', error)
    }
  }

  /**
   * Worker targets currently advertised by agent-fabric, falling back to the
   * configured list when the MCP server is unreachable.
   * @returns target ids used as model ids on the `fabric` route.
   */
  async listTargets(): Promise<readonly string[]> {
    if (this.targetCache.at > Date.now() - 5_000 && this.targetCache.targets.length > 0) {
      return this.targetCache.targets
    }
    try {
      const workers = await this.workers()
      const live = workers
        .filter(worker => worker.liveness === 'up' || worker.liveness === 'live' || worker.liveness === 'busy')
        .map(worker => worker.target)
        .filter(target => target.length > 0)
      this.targetCache = { at: Date.now(), targets: live }
      return live
    } catch {
      // The dashboard/status surface reports the connection failure; model discovery stays empty.
      return []
    }
  }

  /**
   * Ask one peer and wait for its terminal result.
   * @param target - agent-fabric callee target, used as the model id.
   * @param prompt - flattened conversation to hand to the peer.
   * @param signal - cancellation for the wait loop.
   * @returns the peer's final text result.
   */
  async askAndWait(target: string, prompt: string, signal?: AbortSignal, sessionId?: string): Promise<string> {
    if (!this.connected()) {
      await this.client.ensure()
    }
    const requesterSessionId = sessionId !== undefined && sessionId.length > 0 ? sessionId : 'fabric-harness-unscoped'
    const asked = await this.client.callTool<{ taskId?: string }>('peer_ask', {
      target,
      prompt,
      surface: 'print',
      requesterHost: 'fabric-harness',
      requesterSessionId,
      idempotencyKey: `fabric:${requesterSessionId}:${target}:${stableKey(prompt)}`,
    }, this.requestTimeoutMs)
    const taskId = asked.taskId
    if (typeof taskId !== 'string' || taskId.length === 0) {
      throw new Error('fabric: peer_ask returned no taskId')
    }
    const deadline = Date.now() + this.requestTimeoutMs
    for (;;) {
      signal?.throwIfAborted()
      const view = await this.client.callTool<PeerTaskView>('peer_get', { taskId }, 60_000)
      if (view.terminal === true) return settlePeerView(taskId, view)
      if (Date.now() >= deadline) throw new Error(`fabric: peer task ${taskId} timed out after ${this.requestTimeoutMs}ms`)
      // agent-fabric rate-limits non-terminal peer_get responses to one per 2s; poll just above it.
      await sleep(Math.max(this.pollIntervalMs, 2_100), signal)
    }
  }

  /** Snapshot used by both the HTTP surface and the dashboard proxy. */
  async status(): Promise<FabricStatus> {
    const workers = await this.safeWorkers()
    const live = workers
      .filter(worker => worker.liveness === 'up' || worker.liveness === 'live' || worker.liveness === 'busy')
      .map(worker => worker.target)
    const targets = live.length > 0 ? live : [...this.fallbackTargets]
    if (targets.join(',') !== this.emittedTargets.join(',')) {
      this.emittedTargets = targets
      this.ctx.emit('llm/models-updated', 'fabric')
    }
    return {
      enabled: this.enabledValue,
      connected: this.connected(),
      provider: 'fabric',
      dashboardUrl: this.dashboardUrl,
      dashboardReachable: await this.dashboardReachable(),
      targets,
      workers,
      models: this.enabledValue ? targets.map(target => ({ id: target, name: `${target} (Fabric)` })) : [],
    }
  }

  private connected(): boolean {
    return this.client.connected
  }

  private async safeWorkers(): Promise<FabricWorker[]> {
    try {
      return await this.workers()
    } catch {
      return []
    }
  }

  /**
   * Heartbeat view of every callee target known to agent-fabric.
   * @returns normalized worker rows.
   */
  async workers(): Promise<FabricWorker[]> {
    const listed = await this.client.callTool<{ callees?: unknown }>('peer_list', {}, 30_000)
    const callees: unknown = listed.callees
    if (!Array.isArray(callees)) return []
    const workers: FabricWorker[] = []
    for (const entry of callees as readonly unknown[]) {
      if (typeof entry !== 'object' || entry === null) continue
      const row = entry as PeerListRow
      const target = typeof row.target === 'string' ? row.target : ''
      if (target.length === 0) continue
      workers.push({
        target,
        liveness: typeof row.liveness === 'string' ? row.liveness : 'unknown',
        busy: typeof row.busy === 'number' ? row.busy : 0,
        replicas: typeof row.replicas === 'number' ? row.replicas : 0,
      })
    }
    return workers
  }

  private async dashboardReachable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.dashboardUrl}/health`, { signal: AbortSignal.timeout(1_500) })
      return response.ok
    } catch {
      return false
    }
  }

  private registerAdapter(): void {
    this.adapterDispose?.()
    this.adapterDispose = undefined
    if (!this.enabledValue) return
    const adapter = new FabricAdapter(this)
    this.adapterDispose = this.ctx.llm.registerAdapter(['fabric'], adapter)
  }

  private mountRoutes(): void {
    this.ctx.effect(() => this.ctx.webServer.register({
      kind: 'exact',
      path: STATUS_PATH,
      handler: async (request, response) => {
        if (!isLoopback(request)) {
          sendJson(response, 403, { error: 'fabric: loopback only' })
          return
        }
        if (request.method !== 'GET') {
          sendJson(response, 405, { error: 'fabric: GET only' })
          return
        }
        sendJson(response, 200, await this.status())
      },
    }), `fabric: GET ${STATUS_PATH}`)

    this.ctx.effect(() => this.ctx.webServer.register({
      kind: 'exact',
      path: ENGINE_PATH,
      handler: async (request, response) => {
        if (!isLoopback(request)) {
          sendJson(response, 403, { error: 'fabric: loopback only' })
          return
        }
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: 'fabric: POST only' })
          return
        }
        try {
          const body = await readJsonBody(request)
          if (typeof body.enabled === 'boolean') this.setEnabled(body.enabled)
          sendJson(response, 200, await this.status())
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }), `fabric: POST ${ENGINE_PATH}`)

    this.ctx.effect(() => this.ctx.webServer.register({
      kind: 'prefix',
      path: DASHBOARD_PATH,
      handler: async (request, response) => {
        if (!isLoopback(request)) {
          sendJson(response, 403, { error: 'fabric: loopback only' })
          return
        }
        const requested = new URL(request.url ?? '/', 'http://localhost').searchParams.get('path') ?? '/health'
        if (!DASHBOARD_PREFIXES.some(prefix => requested === prefix || requested.startsWith(`${prefix}/`) || requested.startsWith(`${prefix}?`))) {
          sendJson(response, 400, { error: 'fabric: dashboard path is not allowlisted' })
          return
        }
        try {
          const upstream = await fetch(`${this.dashboardUrl}${requested}`, {
            signal: AbortSignal.timeout(4_000),
            headers: { accept: 'application/json' },
          })
          const text = await upstream.text()
          response.statusCode = upstream.status
          response.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json; charset=utf-8')
          response.setHeader('cache-control', 'no-store')
          response.end(text)
        } catch (error) {
          sendJson(response, 502, { error: `fabric: dashboard unreachable (${error instanceof Error ? error.message : String(error)})` })
        }
      },
    }), `fabric: GET ${DASHBOARD_PATH}`)
  }
}

export { Config } from './config.ts'
export type { Config as FabricConfig } from './config.ts'
