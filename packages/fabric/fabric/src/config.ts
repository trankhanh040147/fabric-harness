/**
 * Fabric Harness engine configuration: how to reach agent-fabric and which
 * dashboard/HTTP surface the browser side may read.
 * @module @deepseek-ai/dsh-fabric/config
 */

import z from '@deepseek-ai/schemastery'

/** Deployment configuration for the agent-fabric engine plugin. */
export interface Config {
  /** Mount the `fabric` LLM provider route when true. */
  readonly enabled?: boolean
  /** Executable that launches the agent-fabric MCP server. */
  readonly mcpCommand?: string
  /** Arguments for {@link Config.mcpCommand}. */
  readonly mcpArgs?: string[]
  /** Working directory for the MCP server process. */
  readonly mcpCwd?: string
  /** Base URL of the agent-fabric ops dashboard (loopback only). */
  readonly dashboardUrl?: string
  /** Maximum time one peer task may take before the call fails. */
  readonly requestTimeoutMs?: number
  /** Delay between `peer_get` polls while a peer task runs. */
  readonly pollIntervalMs?: number
  /** Fallback worker targets when `peer_list` cannot be reached. */
  readonly targets?: string[]
}

const DEFAULT_MCP_ENTRY = process.env.FABRIC_MCP_ENTRY ?? ''
const DEFAULT_MCP_COMMAND = process.env.FABRIC_MCP_COMMAND ?? 'node'
const DEFAULT_MCP_ARGS = process.env.FABRIC_MCP_ARGS
  ? process.env.FABRIC_MCP_ARGS.split(' ').filter(part => part.length > 0)
  : DEFAULT_MCP_ENTRY.length > 0 ? [DEFAULT_MCP_ENTRY] : []

/** Validated deployment policy for the agent-fabric engine plugin. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  mcpCommand: z.string().default(DEFAULT_MCP_COMMAND),
  mcpArgs: z.array(z.string()).default(DEFAULT_MCP_ARGS),
  mcpCwd: z.string().default(''),
  dashboardUrl: z.string().default(process.env.FABRIC_DASHBOARD_URL ?? 'http://127.0.0.1:8788'),
  requestTimeoutMs: z.natural().min(60_000).default(900_000),
  pollIntervalMs: z.natural().min(500).default(2_000),
  targets: z.array(z.string()).default([]),
})
