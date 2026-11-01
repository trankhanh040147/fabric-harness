/**
 * Flatten a provider-neutral request into one agent-fabric prompt string.
 * The peer harness has no DSH tool channel, so tool calls and tool results are
 * quoted as plain conversation text rather than replayed as protocol frames.
 * @module @deepseek-ai/dsh-fabric/prompt
 */

import type { GenerateOptions, RequestMessage } from '@deepseek-ai/dsh-llm'

const MAX_PROMPT_CHARS = 100_000

function blockText(block: unknown): string {
  if (typeof block !== 'object' || block === null) return ''
  const record = block as { type?: string; text?: string; name?: string; arguments?: string }
  if (record.type === 'text' && typeof record.text === 'string') return record.text
  if (record.type === 'reasoning' && typeof record.text === 'string') return ''
  if (record.type === 'tool-call') return `[tool call: ${record.name ?? '?'} ${record.arguments ?? ''}]`
  if (record.type === 'file') return '[file attachment]'
  if (record.type === 'image') return '[image attachment]'
  return ''
}

function messageText(message: RequestMessage): string {
  const content = Array.isArray(message.content) ? message.content : []
  const text = content.map(blockText).filter(part => part.length > 0).join('\n')
  return text
}

/** Role label used in the flattened transcript. */
function roleLabel(role: string): string {
  if (role === 'tool') return 'Tool result'
  if (role === 'assistant') return 'Assistant'
  if (role === 'system' || role === 'developer') return 'System'
  return 'User'
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
  const framed = [
    'You are the model behind a peer worker invoked by Fabric Harness.',
    'Answer the conversation below directly and completely.',
    'You have no tools in this channel: do not emit tool calls or ask to run commands.',
    'If the user needs code edits, respond with the exact content and file paths to change.',
    '',
    transcript,
  ].join('\n')
  return framed.length > MAX_PROMPT_CHARS ? framed.slice(0, MAX_PROMPT_CHARS) : framed
}

/** Cheap character-based token estimate for peer usage reporting. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}
