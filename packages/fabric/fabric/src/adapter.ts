/**
 * `fabric` LLM provider: one model per agent-fabric worker target, executed by
 * delegating the flattened conversation to that peer and waiting for its result.
 * @module @deepseek-ai/dsh-fabric/adapter
 */

import { LlmAdapter, LlmError, ToolCallId } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type Fabric from './index.ts'
import { buildPeerPrompt, estimateTokens, parsePeerReply } from './prompt.ts'

/** Adapter serving the single `fabric` provider route. */
export class FabricAdapter extends LlmAdapter {
  /**
   * @param fabric - engine service that owns peers, configuration, and waiting.
   */
  constructor(private readonly fabric: Fabric) {
    super()
  }

  /** {@inheritDoc LlmAdapter.providerInfo} */
  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Fabric' }
  }

  /** {@inheritDoc LlmAdapter.listModels} */
  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    if (!this.fabric.engineEnabled) return []
    const targets = await this.fabric.listTargets()
    return targets.map(target => ({
      provider,
      id: target,
      name: `${target} (Fabric)`,
      description: `Delegate this model call to the ${target} worker through agent-fabric`,
    }))
  }

  /** {@inheritDoc LlmAdapter.resolveModel} */
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: `${model} (Fabric)` })
  }

  /** {@inheritDoc LlmAdapter.stream} */
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (!this.fabric.engineEnabled) {
      throw new LlmError('The Fabric engine is disabled; enable it in the Fabric page', 'FABRIC_DISABLED')
    }
    const target = options.model
    if (target.length === 0) throw new LlmError('Fabric requires a peer target as its model', 'FABRIC_TARGET_MISSING')
    const prompt = buildPeerPrompt(options)
    const reply = parsePeerReply(await this.fabric.askAndWait(target, prompt, options.signal, options.sessionId))
    const usage = {
      inputTokens: estimateTokens(prompt),
      outputTokens: estimateTokens(reply.kind === 'final' ? reply.text : JSON.stringify(reply.calls)),
    }
    if (reply.kind === 'final') {
      const index = 0
      yield { type: 'block-start', index, blockType: 'text' }
      for (let at = 0; at < reply.text.length; at += 4_000) {
        yield { type: 'text-delta', index, text: reply.text.slice(at, at + 4_000) }
      }
      yield { type: 'block-end', index, block: { type: 'text', text: reply.text } }
      yield { type: 'usage', usage }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    for (const [index, call] of reply.calls.entries()) {
      const id = ToolCallId(`fabric-${Date.now().toString(36)}-${String(index)}`)
      yield { type: 'block-start', index, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index, id, name: call.name, argumentsDelta: call.arguments }
      yield { type: 'block-end', index, block: { type: 'tool-call', id, name: call.name, arguments: call.arguments } }
    }
    yield { type: 'usage', usage }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  }
}
