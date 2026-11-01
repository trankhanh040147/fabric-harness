/**
 * Minimal MCP stdio client for the agent-fabric peer server. agent-fabric
 * speaks newline-delimited JSON-RPC, so this client owns process lifecycle,
 * request correlation, and tool-call decoding without pulling an SDK.
 * @module @deepseek-ai/dsh-fabric/mcp
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'

/** One decoded JSON-RPC frame. */
interface Frame {
  readonly id?: number
  readonly method?: string
  readonly params?: unknown
  readonly result?: unknown
  readonly error?: { readonly code: number; readonly message: string }
}

/** Tool result payload the MCP server returns. */
interface ToolCallResult {
  readonly content?: readonly { readonly type?: string; readonly text?: string }[]
  readonly isError?: boolean
}

/** One pending request waiting for its numeric id. */
interface Pending {
  readonly resolve: (value: unknown) => void
  readonly reject: (error: Error) => void
}

/** Connection facts for one spawned agent-fabric MCP server. */
export interface FabricMcpOptions {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd?: string | undefined
}

/** Spawned, lazily reconnected MCP stdio client. */
export class FabricMcpClient {
  private process: ChildProcessWithoutNullStreams | undefined
  private lines: Interface | undefined
  private ready: Promise<void> | undefined
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private closed = false

  /**
   * @param options - executable, arguments, and working directory for the server.
   */
  constructor(private readonly options: FabricMcpOptions) {}

  /** Whether a live server process is attached. */
  get connected(): boolean {
    return this.process !== undefined && this.process.exitCode === null && !this.process.killed
  }

  /** Start the server if needed and finish the MCP handshake exactly once. */
  async ensure(): Promise<void> {
    if (this.closed) throw new Error('fabric: MCP client is disposed')
    if (this.ready !== undefined) return this.ready
    this.ready = this.start()
    try {
      await this.ready
    } catch (error) {
      this.ready = undefined
      throw error
    }
  }

  /** Terminate the server process and reject outstanding requests. */
  dispose(): void {
    this.closed = true
    this.ready = undefined
    this.lines?.close()
    this.lines = undefined
    for (const pending of this.pending.values()) pending.reject(new Error('fabric: MCP client disposed'))
    this.pending.clear()
    this.process?.kill()
    this.process = undefined
  }

  /**
   * Call one MCP tool and decode its JSON text payload.
   * @param name - tool name registered by the agent-fabric server.
   * @param args - tool arguments.
   * @param timeoutMs - bound for this call.
   * @returns the parsed JSON object the server returned.
   */
  async callTool<T>(name: string, args: Record<string, unknown>, timeoutMs: number): Promise<T> {
    await this.ensure()
    const result = await this.request('tools/call', { name, arguments: args }, timeoutMs) as ToolCallResult
    const text = result.content?.find(part => part.type === 'text')?.text
    if (result.isError === true) throw new Error(text ?? `fabric: tool ${name} failed`)
    if (text === undefined) throw new Error(`fabric: tool ${name} returned no text content`)
    try {
      return JSON.parse(text) as T
    } catch {
      return { text } as T
    }
  }

  private async start(): Promise<void> {
    const child = spawn(this.options.command, [...this.options.args], {
      cwd: this.options.cwd === undefined || this.options.cwd.length === 0 ? undefined : this.options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })
    this.process = child
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (data: string) => {
      const line = data.trim()
      if (line.length > 0) console.warn('[fabric/mcp]', line)
    })
    child.on('exit', (code, signal) => {
      this.process = undefined
      this.ready = undefined
      for (const pending of this.pending.values()) {
        pending.reject(new Error(`fabric: MCP server exited (code=${String(code)}, signal=${String(signal)})`))
      }
      this.pending.clear()
    })
    this.lines = createInterface({ input: child.stdout })
    this.lines.on('line', (line) => { this.receive(line) })
    await this.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'fabric-harness', version: '0.2.2-alpha.2' },
    }, 20_000)
    this.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
  }

  private receive(line: string): void {
    if (line.trim().length === 0) return
    let frame: Frame
    try {
      frame = JSON.parse(line) as Frame
    } catch {
      return
    }
    if (frame.id === undefined) return
    const pending = this.pending.get(frame.id)
    if (pending === undefined) return
    this.pending.delete(frame.id)
    if (frame.error !== undefined) pending.reject(new Error(`fabric: MCP error ${frame.error.code}: ${frame.error.message}`))
    else pending.resolve(frame.result)
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const id = this.nextId++
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`fabric: MCP request ${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value) },
        reject: (error) => { clearTimeout(timer); reject(error) },
      })
      try {
        this.send({ jsonrpc: '2.0', id, method, params })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private send(frame: unknown): void {
    const child = this.process
    if (child === undefined || child.stdin.destroyed) throw new Error('fabric: MCP server is not running')
    child.stdin.write(`${JSON.stringify(frame)}\n`)
  }
}
