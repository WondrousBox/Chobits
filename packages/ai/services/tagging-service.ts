import { randomUUID } from 'node:crypto';

import { utils } from '@aim-packages/subtitle';
import { ipcMain } from 'electron';

import { emitAiUsageObservedEvent } from '../analytics/events';
import type { RecordAiUsageEventInput } from '../analytics/types';
import { ChatService } from '../chat-service';
import { getChatMessageUsage } from '../message-usage';
import { getPresetSecrets, listPresets } from '../preset-service';
import { listProviderSecretKeys, listRequiredProviderSecretKeys, supportsProviderCapability } from '../providers/service';
import { getProvider } from '../registry';
import { PiExecutionService } from '../runtime/pi/execution-service';
import { readProviderRequestId } from '../runtime/pi/provider-request-id';
import { generatePiTagsForSegment, parseTagListFromResponse } from '../runtime/pi/tasks/tag';
import { buildTaggingUserPrompt, TAGGING_SYSTEM_PROMPT } from '../runtime/pi/tasks/tag-prompt';
import { isFreeProvider, loadSelectionStrategy, scoreCandidate } from '../selection-strategy';
import type { ChatRequest, ChatResponse, TokenUsage } from '../types';

export type BestPreset = {
  providerId: string;
  presetId?: string;
  secrets?: Record<string, string>;
};

type Candidate = { providerId: string; presetId: string; updatedAt: number; weight: number; secrets?: Record<string, string> };
type TaggingInvocationResult = {
  model?: string;
  providerRequestId?: string;
  providerId?: string;
  rawUsage?: unknown;
  runtime?: string;
  tags: string[];
  usage?: TokenUsage;
};

let piExecutionService: PiExecutionService | undefined;
let legacyTagChatServicePromise: Promise<{ chatEphemeral(win: undefined, req: ChatRequest): Promise<ChatResponse> }> | undefined;

function safeUuid(): string {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function toAnalyticsUsage(usage?: TokenUsage): RecordAiUsageEventInput['usage'] | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    billableInputTokens: usage.billableInputTokens,
    billableOutputTokens: usage.billableOutputTokens,
    billableTotalTokens: usage.billableTotalTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    estimatedCost: usage.cost,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    totalTokens: usage.totalTokens
  };
}

async function recordTaggingUsageEventSafely(input: RecordAiUsageEventInput): Promise<void> {
  await emitAiUsageObservedEvent(input, { producer: 'TaggingService' });
}

function getPiExecutionService(): PiExecutionService {
  piExecutionService ||= new PiExecutionService();
  return piExecutionService;
}

function getLegacyTagChatService(): Promise<{ chatEphemeral(win: undefined, req: ChatRequest): Promise<ChatResponse> }> {
  legacyTagChatServicePromise ||= Promise.resolve(new ChatService());
  return legacyTagChatServicePromise;
}

export const TaggingService = {
  /**
   * 自动选择"最佳聊天预设"的原则说明：
   * 1) 仅考虑已注册且实现了 chat() 能力的 Provider 对应的预设；
   * 2) 若该 Provider 的配置 schema 有必填字段，则优先那些"已配置齐所有必填秘钥"的预设；
   * 3) 结合最近更新时间（updatedAt）给予轻微加权；
   * 4) 最终按权重与最近更新时间降序排序，取第一名；
   * 5) 若没有可用预设，则回退到可聊天的 Provider（优先 ollama，再退到第一个可用 Provider）。
   *
   * 同时支持通过用户可编辑的 JSON（位于 userData/ai-selection-strategy.json）预设偏好：
   * - preferredProviders: 按顺序的偏好 Provider 列表（越靠前加分越多）
   * - freeProviders: 认为"免费/本地"的 Provider 列表（如 ollama）
   * - providerWeights: 针对特定 Provider 的微调权重
   * - boosts.recentHalfLifeHours / recentBase: 控制"最近使用"加分的衰减
   * - flags.freeOnly: 若为 true，则仅在 freeProviders 范围内选择
   * 如未创建该文件，会自动写入一个默认模板，用户可自行修改以生效。
   */
  async chooseBestChatPreset(): Promise<BestPreset> {
    const all = listPresets();
    const candidates: Candidate[] = [];
    // 读取（并在首次缺失时生成）用户策略
    const strategy = loadSelectionStrategy();
    for (const inst of all) {
      const prov = getProvider(inst.providerId);
      if (!prov || !supportsProviderCapability(inst.providerId, 'chat', prov) || typeof prov.chat !== 'function') continue;
      const requiredKeys = listRequiredProviderSecretKeys(inst.providerId);
      const secretKeys = requiredKeys.length ? requiredKeys : listProviderSecretKeys(inst.providerId);
      let secrets: Record<string, string> = {};
      try {
        secrets = await getPresetSecrets(inst.id, secretKeys);
      } catch {
        secrets = {};
      }
      const hasAllRequired = requiredKeys.length ? requiredKeys.every((k) => !!secrets[k]) : true;
      // 基础权重：是否齐全 + 非线性微弱"时间"项（兼容旧逻辑）
      let weight = (hasAllRequired ? 100 : 10) + Math.min(50, Math.floor(((inst as any).updatedAt || 1) / 1e12));
      // 若启用了"仅免费"模式，则非免费 Provider 直接跳过
      if (strategy.flags?.freeOnly && !isFreeProvider(inst.providerId, strategy)) continue;
      // 应用用户策略加权（偏好、免费、Provider/Model 定制、最近使用衰减等）
      weight += scoreCandidate(
        {
          providerId: inst.providerId,
          updatedAt: (inst as any).updatedAt || 1,
          hasAllRequired
        },
        strategy
      );
      candidates.push({
        providerId: inst.providerId,
        presetId: inst.id,
        updatedAt: (inst as any).updatedAt || 1,
        weight,
        secrets: Object.keys(secrets).length ? secrets : undefined
      });
    }
    candidates.sort((a, b) => b.weight - a.weight || b.updatedAt - a.updatedAt);
    const best = candidates[0];
    if (best) return { providerId: best.providerId, presetId: best.presetId, secrets: best.secrets };
    // Fallbacks: pick any provider that supports chat (e.g., Ollama)
    const provFallback = getProvider('ollama') || getProvider();
    return { providerId: provFallback?.id || 'ollama' };
  },

  /**
   * 从文本中解析标签
   */
  parseTagsFromText(txt: string): string[] {
    return parseTagListFromResponse(txt);
  },

  async tagOneSegmentLegacy(
    segment: string,
    best: BestPreset,
    context: {
      requestId: string;
      segmentCount: number;
      segmentIndex: number;
      textChars: number;
    }
  ): Promise<TaggingInvocationResult> {
    const response = await (
      await getLegacyTagChatService()
    ).chatEphemeral(undefined, {
      agentId: 'chat',
      extras: {
        analyticsUsage: {
          metadata: {
            requestKind: 'auto_tag_text',
            runtime: 'legacy_ephemeral',
            segmentChars: segment.length,
            segmentCount: context.segmentCount,
            segmentIndex: context.segmentIndex,
            textChars: context.textChars
          },
          operationKey: `segment:${context.segmentIndex}`,
          sourceId: context.requestId,
          sourceLabel: '自动打标',
          sourceType: 'tagging',
          usageCategory: 'content_processing',
          usageFeature: 'tagging',
          usageStage: 'classify'
        }
      },
      maxTokens: 256,
      messages: [
        {
          role: 'system',
          content: TAGGING_SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: buildTaggingUserPrompt(segment)
        }
      ],
      persist: false,
      providerId: best.providerId,
      providerPresetId: best.presetId,
      temperature: 0.2
    });

    const responseMetadata = response.metadata as Record<string, unknown> | undefined;
    const messageMetadata = response.message?.metadata as Record<string, unknown> | undefined;

    return {
      model: typeof responseMetadata?.model === 'string' ? responseMetadata.model : undefined,
      providerRequestId: readProviderRequestId(messageMetadata) ?? readProviderRequestId(responseMetadata),
      providerId: response.providerId || best.providerId,
      rawUsage: messageMetadata?.piRawUsage ?? responseMetadata?.rawUsage,
      runtime: typeof responseMetadata?.runtime === 'string' ? responseMetadata.runtime : 'legacy_ephemeral',
      tags: this.parseTagsFromText(response?.message?.content || '').slice(0, 5),
      usage: response.usage || getChatMessageUsage(response.message)
    };
  },

  async recordSegmentUsage(params: {
    best: BestPreset;
    completedAt: number;
    errorMessage?: string;
    invocation?: Omit<TaggingInvocationResult, 'tags'>;
    requestId: string;
    segment: string;
    segmentCount: number;
    segmentIndex: number;
    startedAt: number;
    status: 'completed' | 'failed';
    tagCount?: number;
    textChars: number;
  }): Promise<void> {
    await recordTaggingUsageEventSafely({
      traceId: params.requestId,
      requestId: params.requestId,
      operationKey: `segment:${params.segmentIndex}`,
      sourceType: 'tagging',
      sourceId: params.requestId,
      sourceLabel: '自动打标',
      usageCategory: 'content_processing',
      usageFeature: 'tagging',
      usageStage: 'classify',
      providerId: params.invocation?.providerId || params.best.providerId,
      providerPresetId: params.best.presetId,
      providerRequestId: params.invocation?.providerRequestId,
      model: params.invocation?.model || 'unknown',
      agentId: 'tagging-service',
      status: params.status,
      usage: toAnalyticsUsage(params.invocation?.usage),
      rawUsage: params.invocation?.rawUsage,
      meteringSource: 'provider_reported',
      startedAt: params.startedAt,
      completedAt: params.completedAt,
      metadata: {
        errorMessage: params.errorMessage,
        requestKind: 'auto_tag_text',
        runtime: params.invocation?.runtime || 'unknown',
        segmentChars: params.segment.length,
        segmentCount: params.segmentCount,
        segmentIndex: params.segmentIndex,
        tagCount: params.tagCount,
        textChars: params.textChars
      }
    });
  },

  async autoTagText(text: string, opts?: { maxLabels?: number }): Promise<string[]> {
    const textStr = (text || '').trim();
    if (!textStr) return [];
    const requestId = safeUuid();

    // Chunk long text for better tagging
    let segments = [textStr];
    try {
      const chunks = utils.chunkText(textStr);
      if (Array.isArray(chunks) && chunks.length) segments = chunks.map((c: any) => c.content);
    } catch {
      // ignore chunking errors
    }

    const maxLabels = Math.max(1, Math.min(50, Number(opts?.maxLabels) || 8));

    // 聚合器
    const agg = new Map<string, { label: string; score: number }>();

    const normalize = (tag: string): string => {
      return (tag || '')
        .trim()
        .replace(/^[-#@\s]+|[-#@\s]+$/g, '')
        .replace(/[\p{P}\p{S}]+/gu, '')
        .toLowerCase();
    };

    const uniqPush = (t: string, weight = 1): void => {
      const clean = t.trim();
      if (!clean) return;
      const key = normalize(clean);
      if (!key) return;
      const prev = agg.get(key);
      if (prev) prev.score += weight;
      else agg.set(key, { label: clean, score: weight });
    };

    const best = await this.chooseBestChatPreset();
    const legacyFallbackAllowed = !getPiExecutionService().getAvailability({
      extras: {
        runtime: 'pi'
      }
    }).available;
    const usePi = !legacyFallbackAllowed;

    // 处理每个片段
    for (const [segmentIndex, segment] of segments.entries()) {
      let tags: string[] = [];
      const startedAt = Date.now();

      if (usePi) {
        try {
          const result = await generatePiTagsForSegment({
            providerId: best.providerId,
            providerPresetId: best.presetId,
            segment
          });
          tags = result.tags;
          await this.recordSegmentUsage({
            best,
            completedAt: Date.now(),
            invocation: result,
            requestId,
            segment,
            segmentCount: segments.length,
            segmentIndex,
            startedAt,
            status: 'completed',
            tagCount: tags.length,
            textChars: textStr.length
          });
        } catch (error) {
          console.warn('[TaggingService] Pi tagging failed:', error);
          await this.recordSegmentUsage({
            best,
            completedAt: Date.now(),
            errorMessage: error instanceof Error ? error.message : String(error),
            requestId,
            segment,
            segmentCount: segments.length,
            segmentIndex,
            startedAt,
            status: 'failed',
            textChars: textStr.length
          });
          continue;
        }
      }

      if (!tags.length && legacyFallbackAllowed) {
        try {
          const result = await this.tagOneSegmentLegacy(segment, best, {
            requestId,
            segmentCount: segments.length,
            segmentIndex,
            textChars: textStr.length
          });
          tags = result.tags;
          await this.recordSegmentUsage({
            best,
            completedAt: Date.now(),
            invocation: result,
            requestId,
            segment,
            segmentCount: segments.length,
            segmentIndex,
            startedAt,
            status: 'completed',
            tagCount: tags.length,
            textChars: textStr.length
          });
        } catch (error) {
          console.warn('[TaggingService] Legacy tagging failed:', error);
          await this.recordSegmentUsage({
            best,
            completedAt: Date.now(),
            errorMessage: error instanceof Error ? error.message : String(error),
            requestId,
            segment,
            segmentCount: segments.length,
            segmentIndex,
            startedAt,
            status: 'failed',
            textChars: textStr.length
          });
          continue;
        }
      }

      for (const t of tags) uniqPush(t, 1);
    }

    // 返回最终标签
    const finalTags = Array.from(agg.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxLabels)
      .map((x) => x.label);

    return finalTags;
  },

  registerIpc(): void {
    ipcMain.handle('ai:autoTagText', async (_e, payload: { text: string; maxLabels?: number }) => {
      const tags = await this.autoTagText(payload?.text || '', { maxLabels: payload?.maxLabels });
      return { success: true, tags };
    });
  }
};
