/**
 * Flatten a provider-neutral request into one agent-fabric prompt string, and
 * describe the tool protocol a peer must follow when the request carries tools.
 * @module @deepseek-ai/dsh-fabric/prompt
 */

import type { GenerateOptions, RequestMessage } from '@deepseek-ai/dsh-llm'

const MAX_PROMPT_CHARS = 100_000
const MAX_TOOL_SCHEMA_CHARS = 40_000

function blockText(block: unknown): string {
  if (typeof block !== 'object' || block === null) return ''
  const record = block as { type?: string; text?: string; name?: string; arguments?: string }
  if (record.type === 'text' && typeof record.text === 'string') return record.text
  if (record.type === 'reasoning') return ''
  if (record.type === 'tool-call') return `[tool call: ${record.name ?? '?'} ${record.arguments ?? ''}]`
  if (record.type === 'file') return '[file attachment]'
  if (record.type === 'image') return '[image attachment]'
  return ''
}

function messageText(message: RequestMessage): string {
  const content = Array.isArray(message.content) ? message.content : []
  return content.map(blockText).filter(part => part.length > 0).join('\n')
}

/** Role label used in the flattened transcript. */
function roleLabel(role: string): string {
  if (role === 'tool') return 'Tool result'
  if (role === 'assistant') return 'Assistant'
  if (role === 'system' || role === 'developer') return 'System'
  return 'User'
}

/** One parsed tool request from a peer reply. */
export interface PeerToolCall {
  readonly name: string
  readonly arguments: string
}

/** Parsed peer reply: final text or harness tool calls. */
export type PeerReply =
  | { readonly kind: 'final'; readonly text: string }
  | { readonly kind: 'tool_calls'; readonly calls: readonly PeerToolCall[] }

/** Tool schemas rendered compactly for the peer prompt. */
function toolCatalog(options: GenerateOptions): string {
  const tools = options.tools ?? []
  if (tools.length === 0) return ''
  const catalog = JSON.stringify(tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  })))
  return catalog.length > MAX_TOOL_SCHEMA_CHARS ? `${catalog.slice(0, MAX_TOOL_SCHEMA_CHARS)}…` : catalog
}

/** How a peer asks the harness to run a tool instead of answering. */
function protocolBlock(options: GenerateOptions): string[] {
  if ((options.tools?.length ?? 0) === 0) return []
  return [
    'TOOL PROTOCOL',
    'You are the model half of a harness; the harness executes tools for you.',
    'Do not run commands, edit files, or use your own tools.',
    'Reply with exactly one JSON object and no prose outside it:',
    '- to use tools: {"type":"tool_calls","tool_calls":[{"name":"read","arguments":{"path":"/tmp/x"}}]}',
    '- to finish: {"type":"final","text":"your answer"}',
    'Run one tool-calls reply at a time; the harness returns tool results in the next message.',
    'Available tools:',
    toolCatalog(options),
    '',
  ]
}

/**
 * Build the single prompt string sent to a peer worker.
 * @param options - the assembled model request.
 * @returns one bounded transcript string.
 */
export function buildPeerPrompt(options: GenerateOptions): string {
  const parts: string[] = []
  if (typeof options.system === 'string' && options.system.trim().length > 0) parts.push(`System:\n${options.system}`)
  for (const message of options.messages) {
    const text = messageText(message)
    if (text.length === 0) continue
    parts.push(`${roleLabel(message.role)}:\n${text}`)
  }
  const transcript = parts.join('\n\n')
  const protocol = protocolBlock(options)
  const framed = [
    'You are the model behind a peer worker invoked by Fabric Harness.',
    'Answer the conversation below directly and completely.',
    ...protocol,
    '',
    transcript,
  ].join('\n')
  return framed.length > MAX_PROMPT_CHARS ? framed.slice(0, MAX_PROMPT_CHARS) : framed
}

/** Extract one JSON object from a reply that may be fenced or padded. */
function extractJson(reply: string): string | undefined {
  const trimmed = reply.trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  const candidate = fenced?.[1]?.trim() ?? trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  return candidate.slice(start, end + 1)
}

/**
 * Parse a peer reply under the tool protocol; malformed replies fall back to
 * final text so a peer that ignores the protocol still produces an answer.
 * @param reply - raw peer result text.
 * @returns parsed reply.
 */
export function parsePeerReply(reply: string): PeerReply {
  const text = reply.trim()
  const json = extractJson(text)
  if (json !== undefined) {
    try {
      const parsed: unknown = JSON.parse(json)
      if (typeof parsed === 'object' && parsed !== null) {
        const record = parsed as { type?: unknown; text?: unknown; tool_calls?: unknown }
        if (record.type === 'final' && typeof record.text === 'string') return { kind: 'final', text: record.text }
        if (record.type === 'tool_calls' && Array.isArray(record.tool_calls)) {
          const calls: PeerToolCall[] = []
          for (const entry of record.tool_calls as readonly unknown[]) {
            if (typeof entry !== 'object' || entry === null) continue
            const call = entry as { name?: unknown; arguments?: unknown }
            if (typeof call.name !== 'string' || call.name.length === 0) continue
            calls.push({
              name: call.name,
              arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments ?? {}),
            })
          }
          if (calls.length > 0) return { kind: 'tool_calls', calls }
        }
      }
    } catch {
      // Not protocol JSON; treat the reply as final text.
    }
  }
  return { kind: 'final', text }
}

/** Cheap character-based token estimate for peer usage reporting. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}
