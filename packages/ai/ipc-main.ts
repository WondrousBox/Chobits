import { writeFile } from '@aim-packages/file-utils';
import { type AimSegments, parser, tools } from '@aim-packages/subtitle';
import { randomUUID } from 'crypto';
import { BrowserWindow, ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

import { ChatRepo, ResourcesRepo } from '../common/db';
import { BasicAgent } from './agents/basic';
import { RAGAgent } from './agents/rag';
import { TaggerAgent } from './agents/tagger';
import { ChatService } from './chat-service';
import { GlossaryStore } from './glossary-store';
import { InstancesStore } from './instances-store';
import { createChatFunction, createEventEmitter, loadContentFromResource, loadSegmentsFromResource, setupModelAndAgent } from './ipc-handler-helpers';
import { PromptsStore } from './prompts-store';
import { AnthropicProvider } from './providers/anthropic';
import { DeepSeekProvider } from './providers/deepseek';
import { GeminiProvider } from './providers/gemini';
import { OllamaProvider } from './providers/ollama';
import { OpenAIProvider } from './providers/openai';
import { QwenProvider } from './providers/qwen';
import { ZhipuProvider } from './providers/zhipu';
import { getProvider, listAgents, listProviders, registerAgent, registerProvider } from './registry';
import { SummaryService } from './services/summary-service';
import { TaggingService } from './services/tagging-service';
import { TranslationService } from './services/translation-service';
import {
  addApiKey,
  clearAllSecrets,
  clearProviderSecrets as clearSecretsStore,
  getAllSecrets,
  getApiKeys,
  getFirstApiKey,
  removeApiKey,
  setApiKeys,
  setDefaultApiKey,
  setProviderSecrets as setSecretsStore,
  updateApiKey
} from './settings-store';
import { getAllInstanceSecrets as getAllInstSecrets, setInstanceSecrets as setInstSecrets } from './settings-store';

// 将 AimSegments 转换为 ISegment 格式
type ISegment = [string, string, string, string | undefined];
function convertToISegment(segment: AimSegments): ISegment {
  return [segment.st, segment.et, segment.text, undefined];
}

// 检测字幕格式
type SubtitleFormat = 'srt' | 'vtt' | 'ass';
function detectSubtitleFormat(filePath: string): SubtitleFormat {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.vtt')) return 'vtt';
  if (lower.endsWith('.ass') || lower.endsWith('.ssa')) return 'ass';
  return 'srt';
}

/**
 * 保存翻译后的字幕到文件
 * @param resourceId 资源 ID
 * @param originalSegments 原文字幕片段（可能不完整，用于索引匹配）
 * @param translatedSegments 翻译后的字幕片段
 */
async function saveTranslatedSubtitle(resourceId: string, originalSegments: AimSegments[], translatedSegments: Array<{ index: number; text: string }>): Promise<void> {
  if (!resourceId) return;

  try {
    // 获取资源信息
    const resource = await ResourcesRepo.getById(resourceId);
    if (!resource || !resource.filePath) {
      console.warn('[translation-save] 资源不存在或没有文件路径:', resourceId);
      return;
    }

    const filePath = resource.filePath;
    const lower = filePath.toLowerCase();

    // 检查是否是字幕文件
    const isSubtitleFile = lower.endsWith('.srt') || lower.endsWith('.vtt') || lower.endsWith('.ass') || lower.endsWith('.ssa');
    if (!isSubtitleFile) {
      console.warn('[translation-save] 不是字幕文件:', filePath);
      return;
    }

    // 从文件重新读取原始字幕，确保获取完整的时间戳信息
    const fileContent = await fs.readFile(filePath, 'utf8');
    const parsedResult = await parser.parseSubtitle(fileContent);
    const originalSegmentsFromFile = parsedResult?.segments || [];

    // 检测格式
    const format = detectSubtitleFormat(filePath);

    // 构建翻译后的完整字幕数组（segments2）
    // 使用从文件读取的原始字幕，确保时间戳完整
    const segments2: AimSegments[] = originalSegmentsFromFile.map((seg, index) => {
      const translated = translatedSegments.find((t) => t.index === index);
      return {
        ...seg,
        text: translated?.text || ''
      };
    });

    // 转换为 ISegment 格式
    const iSegments1 = originalSegmentsFromFile.filter((seg) => !seg.delete).map(convertToISegment);
    const iSegments2 = segments2.filter((seg) => !seg.delete).map(convertToISegment);

    // 根据格式选择不同的输出方法
    let content: string;
    if (format === 'vtt' && 'outputVtt' in tools && typeof tools.outputVtt === 'function') {
      content = tools.outputVtt({ segments1: iSegments1, segments2: iSegments2 });
    } else if (format === 'ass' && 'outputAss' in tools && typeof tools.outputAss === 'function') {
      content = tools.outputAss({ segments1: iSegments1, segments2: iSegments2 });
    } else {
      // 默认使用 SRT 格式输出
      content = tools.outputSrt({ segments1: iSegments1, segments2: iSegments2 });
    }

    // 确保目录存在
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // 写入文件
    await writeFile(filePath, content);

    // 更新资源的文件大小
    try {
      const buf = Buffer.from(content, 'utf8');
      await ResourcesRepo.update(resourceId, { sizeBytes: buf.byteLength });
    } catch {
      // 忽略更新失败
    }

    console.log(`[translation-save] 字幕已保存 (${format}):`, filePath);
  } catch (error) {
    console.error('[translation-save] 保存字幕失败:', error);
  }
}

export function initAIHandlers(win: BrowserWindow): void {
  // Bootstrapping built-in provider(s) and agent(s)
  // Register built-in providers
  registerProvider(new OpenAIProvider());
  registerProvider(new AnthropicProvider());
  registerProvider(new GeminiProvider());
  registerProvider(new OllamaProvider());
  registerProvider(new DeepSeekProvider());
  registerProvider(new QwenProvider());
  registerProvider(new ZhipuProvider());
  registerAgent(BasicAgent);
  registerAgent(RAGAgent);
  registerAgent(TaggerAgent);

  const chat = new ChatService(win);
  chat.registerIpc();
  // Register AI utility IPCs (e.g., auto-tagging)
  TaggingService.registerIpc();

  // 取消翻译任务
  ipcMain.handle('ai:cancelTranslate', async (_e, payload: { requestId: string }) => {
    const success = TranslationService.cancelTranslation(payload.requestId);
    if (success) {
      return { success: true };
    }
    return { success: false, message: 'Task not found' };
  });

  // Settings & registry inspection
  ipcMain.handle('ai:getProviders', async () => {
    const providers = listProviders();
    const rows = await Promise.all(
      providers.map(async (p) => ({
        id: p.id,
        label: p.label,
        configured: !!(await Promise.resolve((p.isConfigured?.() as any) ?? true)),
        schema: p.getConfigSchema?.()
      }))
    );
    return rows;
  });

  ipcMain.handle('ai:getProviderSecrets', async (_e, payload: { providerId: string }) => {
    const p = getProvider(payload.providerId);
    const schema = p?.getConfigSchema?.();
    const keys = (schema?.fields || []).map((f) => f.key);
    const values = await getAllSecrets(payload.providerId, keys);
    return values;
  });

  ipcMain.handle('ai:setProviderSecrets', async (_e, payload: { providerId: string; secrets: Record<string, string> }) => {
    await setSecretsStore(payload.providerId, payload.secrets);
    const p = getProvider(payload.providerId);
    if (p?.setSecrets) await Promise.resolve(p.setSecrets(payload.secrets));
    return { ok: true };
  });

  ipcMain.handle('ai:clearProviderSecrets', async (_e, payload: { providerId: string }) => {
    await clearSecretsStore(payload.providerId);
    const p = getProvider(payload.providerId);
    // If the provider has a way to clear secrets in memory, we might want to call it,
    // but usually setSecrets({}) or similar might be enough if we wanted to clear it,
    // but here we just clear the store.
    // If the provider caches secrets, it might need a reload or re-fetch.
    // For now, we assume the provider fetches secrets when needed or we can set empty secrets.
    if (p?.setSecrets) await Promise.resolve(p.setSecrets({}));
    return { ok: true };
  });

  // Multiple API Keys Management
  ipcMain.handle('ai:getProviderApiKeys', async (_e, payload: { providerId: string; key: string }) => {
    return await getApiKeys(payload.providerId, payload.key);
  });

  ipcMain.handle('ai:setProviderApiKeys', async (_e, payload: { providerId: string; key: string; keys: Array<{ name: string; value: string; isDefault?: boolean }> }) => {
    await setApiKeys(payload.providerId, payload.key, payload.keys);
    return { ok: true };
  });

  ipcMain.handle('ai:addProviderApiKey', async (_e, payload: { providerId: string; key: string; apiKey: { name: string; value: string } }) => {
    await addApiKey(payload.providerId, payload.key, payload.apiKey);
    return { ok: true };
  });

  ipcMain.handle('ai:updateProviderApiKey', async (_e, payload: { providerId: string; key: string; apiKeyName: string; updates: Partial<{ name: string; value: string; isDefault: boolean }> }) => {
    await updateApiKey(payload.providerId, payload.key, payload.apiKeyName, payload.updates);
    return { ok: true };
  });

  ipcMain.handle('ai:removeProviderApiKey', async (_e, payload: { providerId: string; key: string; apiKeyName: string }) => {
    await removeApiKey(payload.providerId, payload.key, payload.apiKeyName);
    return { ok: true };
  });

  ipcMain.handle('ai:setDefaultProviderApiKey', async (_e, payload: { providerId: string; key: string; apiKeyName: string }) => {
    await setDefaultApiKey(payload.providerId, payload.key, payload.apiKeyName);
    return { ok: true };
  });

  ipcMain.handle('ai:clearAllSecrets', async () => {
    await clearAllSecrets();
    // 清理所有 provider 的内存中的 secrets
    const providers = listProviders();
    for (const p of providers) {
      if (p?.setSecrets) {
        try {
          await Promise.resolve(p.setSecrets({}));
        } catch {
          // ignore
        }
      }
    }
    return { ok: true };
  });

  ipcMain.handle('ai:getAgents', async () => {
    return listAgents().map((a) => ({ id: a.id, label: a.label, description: a.description }));
  });

  ipcMain.handle('ai:transcribe', async (_e, payload: { providerId: string; file: Buffer; model?: string; language?: string; prompt?: string }) => {
    const provider = getProvider(payload.providerId);
    if (!provider) {
      throw new Error(`Provider ${payload.providerId} not found`);
    }
    if (!provider.transcribe) {
      throw new Error(`Provider ${payload.providerId} does not support transcription`);
    }

    // Ensure secrets are loaded
    const secrets = await getAllSecrets(
      payload.providerId,
      (provider.getConfigSchema().fields || []).map((f) => f.key)
    );
    await Promise.resolve(provider.setSecrets(secrets));

    return await provider.transcribe(payload.file, {
      model: payload.model,
      language: payload.language,
      prompt: payload.prompt
    });
  });

  ipcMain.handle('ai:listModels', async (_e, payload: { providerId: string; instanceId?: string }) => {
    const p = getProvider(payload.providerId);
    if (!p) return [];
    try {
      if (p.listModels) {
        let opts: any = undefined;
        if (payload.instanceId) {
          const inst = InstancesStore.get(payload.instanceId);
          if (inst) {
            const schema = p.getConfigSchema?.();
            const keys = (schema?.fields || []).map((f) => f.key);
            const secrets = await getAllInstSecrets(payload.instanceId, keys);
            opts = { secrets };
          }
        }
        return await Promise.resolve(p.listModels(opts));
      }
      return [];
    } catch (err) {
      console.log(err);
      return [];
    }
  });

  // Provider Instances CRUD
  ipcMain.handle('ai:listInstances', async (_e, payload?: { providerId?: string }) => {
    return InstancesStore.list(payload?.providerId);
  });
  ipcMain.handle('ai:createInstance', async (_e, payload: { providerId: string; name: string; model?: string; systemPrompt?: string; config?: Record<string, any> }) => {
    return InstancesStore.create(payload as any);
  });
  ipcMain.handle('ai:updateInstance', async (_e, payload: { id: string; patch: any }) => {
    return InstancesStore.update(payload.id, payload.patch);
  });
  ipcMain.handle('ai:deleteInstance', async (_e, payload: { id: string }) => {
    return { ok: InstancesStore.delete(payload.id) };
  });
  // Instance secrets
  ipcMain.handle('ai:getInstanceSecrets', async (_e, payload: { instanceId: string }) => {
    const inst = InstancesStore.get(payload.instanceId);
    const schema = getProvider(inst?.providerId || '')?.getConfigSchema?.();
    const keys = (schema?.fields || []).map((f) => f.key);
    return await getAllInstSecrets(payload.instanceId, keys);
  });
  ipcMain.handle('ai:setInstanceSecrets', async (_e, payload: { instanceId: string; secrets: Record<string, string> }) => {
    await setInstSecrets(payload.instanceId, payload.secrets);
    return { ok: true };
  });

  // Prompt Templates CRUD
  ipcMain.handle('ai:listPromptTemplates', async () => PromptsStore.list());
  ipcMain.handle('ai:createPromptTemplate', async (_e, payload: { name: string; type: 'system' | 'user'; content: string; tags?: string[] }) => PromptsStore.create(payload));
  ipcMain.handle('ai:updatePromptTemplate', async (_e, payload: { id: string; patch: any }) => PromptsStore.update(payload.id, payload.patch));
  ipcMain.handle('ai:deletePromptTemplate', async (_e, payload: { id: string }) => ({ ok: PromptsStore.delete(payload.id) }));

  // Conversations & Messages (history)
  ipcMain.handle('ai:listConversations', async (_e, payload?: { includeDeleted?: boolean; limit?: number; offset?: number }) => {
    const rows = await ChatRepo.listConversations({ includeDeleted: payload?.includeDeleted }, payload?.limit ?? 200, payload?.offset ?? 0);
    return rows;
  });
  ipcMain.handle('ai:listMessages', async (_e, payload: { conversationId: string; limit?: number; offset?: number }) => {
    return ChatRepo.listMessages(payload.conversationId, payload?.limit ?? 2000, payload?.offset ?? 0);
  });
  ipcMain.handle('ai:renameConversation', async (_e, payload: { id: string; title: string }) => {
    const row = await ChatRepo.renameConversation(payload.id, payload.title);
    return row ? { ok: true, row } : { ok: false };
  });
  ipcMain.handle('ai:deleteConversation', async (_e, payload: { id: string }) => {
    const row = await ChatRepo.softDeleteConversation(payload.id);
    return row ? { ok: true } : { ok: false };
  });
  ipcMain.handle('ai:restoreConversation', async (_e, payload: { id: string }) => {
    const row = await ChatRepo.restoreConversation(payload.id);
    return row ? { ok: true } : { ok: false };
  });

  // 获取所有活跃的翻译任务
  ipcMain.handle('ai:getTranslationTasks', async () => {
    // The service already excludes internal properties (controller, translator)
    return TranslationService.getAllActiveTranslations();
  });

  // 获取指定任务已翻译的片段
  ipcMain.handle('ai:getTranslatedSegments', async (_e, payload: { requestId: string }) => {
    return TranslationService.getTranslatedSegments(payload.requestId);
  });

  // ==================== 翻译术语管理 ====================

  // 分类管理
  ipcMain.handle('ai:listGlossaryCategories', async () => GlossaryStore.listCategories());
  ipcMain.handle('ai:createGlossaryCategory', async (_e, payload: { name: string; description?: string }) => GlossaryStore.createCategory(payload));
  ipcMain.handle('ai:updateGlossaryCategory', async (_e, payload: { id: string; patch: { name?: string; description?: string } }) => GlossaryStore.updateCategory(payload.id, payload.patch));
  ipcMain.handle('ai:deleteGlossaryCategory', async (_e, payload: { id: string }) => ({ ok: GlossaryStore.deleteCategory(payload.id) }));

  // 术语表管理
  ipcMain.handle('ai:listGlossaries', async (_e, payload?: { categoryId?: string }) => GlossaryStore.listGlossaries(payload?.categoryId));
  ipcMain.handle('ai:getGlossary', async (_e, payload: { id: string }) => GlossaryStore.getGlossary(payload.id));
  ipcMain.handle('ai:createGlossary', async (_e, payload: { categoryId: string; name: string; description?: string; entries: any[]; sourceFile?: string; sourceFormat?: string }) =>
    GlossaryStore.createGlossary(payload)
  );
  ipcMain.handle('ai:updateGlossary', async (_e, payload: { id: string; patch: { categoryId?: string; name?: string; description?: string; entries?: any[] } }) =>
    GlossaryStore.updateGlossary(payload.id, payload.patch)
  );
  ipcMain.handle('ai:deleteGlossary', async (_e, payload: { id: string }) => ({ ok: GlossaryStore.deleteGlossary(payload.id) }));
  ipcMain.handle('ai:addGlossaryEntries', async (_e, payload: { glossaryId: string; entries: any[] }) => GlossaryStore.addEntries(payload.glossaryId, payload.entries));
  ipcMain.handle('ai:removeGlossaryEntry', async (_e, payload: { glossaryId: string; source: string }) => GlossaryStore.removeEntry(payload.glossaryId, payload.source));
  ipcMain.handle('ai:updateGlossaryEntry', async (_e, payload: { glossaryId: string; oldSource: string; newEntry: any }) =>
    GlossaryStore.updateEntry(payload.glossaryId, payload.oldSource, payload.newEntry)
  );

  // 导入解析
  ipcMain.handle('ai:parseGlossaryContent', async (_e, payload: { content: string; fileName?: string }) => GlossaryStore.parseContent(payload.content, payload.fileName));
  ipcMain.handle('ai:mergeGlossaries', async (_e, payload: { ids: string[] }) => GlossaryStore.mergeGlossaries(payload.ids));

  // 字幕翻译：在主进程中处理，向所有窗口发送消息
  ipcMain.handle(
    'ai:translate',
    async (
      _e,
      payload: {
        providerId: string;
        model: string;
        segments?: any[];
        resourceId?: string;
        targetLanguage: string;
        languageNames: Record<string, string>;
        force?: boolean;
        metadata?: Record<string, any>;
        options?: {
          maxConcurrency?: number;
          chunkSize?: number;
          maxRetries?: number;
          promptTemplate?: string;
          generateSummary?: boolean;
          glossary?: any;
        };
      }
    ) => {
      const { providerId, model, segments, resourceId, targetLanguage, languageNames, force, metadata, options } = payload;
      const requestId = randomUUID();
      const eventsChannel = `subtitle:translate:${requestId}`;
      const taskLabel = `${providerId}/${model}`;

      // 步骤1: 读取文件，加载字幕片段
      let actualSegments = segments;
      if (!actualSegments && resourceId) {
        try {
          actualSegments = await loadSegmentsFromResource(resourceId);
        } catch (error) {
          console.error('[translate] Failed to load segments from resource:', error);
          throw error;
        }
      }

      if (!actualSegments || actualSegments.length === 0) {
        throw new Error('No segments provided and unable to load segments from resourceId');
      }

      // 步骤2: 设置模型和Agent
      const { agent } = await setupModelAndAgent(providerId, model, 'assistant');

      // 步骤3: 创建聊天函数
      const chatFn = createChatFunction(agent);

      // 步骤4: 创建事件发射器，处理翻译回调
      const accumulatedTranslations: Array<{ index: number; text: string }> = [];

      const emit = createEventEmitter({
        requestId,
        eventType: 'subtitle:translate',
        busyMessage: '开始翻译字幕...',
        progressMessage: '正在翻译...',
        onChunkComplete: async (data) => {
          if (data?.segments && metadata?.resourceId) {
            // 累积翻译结果
            const chunkSegments = data.segments as Array<{ index: number; text: string }>;
            chunkSegments.forEach((seg) => {
              const existing = accumulatedTranslations.findIndex((t) => t.index === seg.index);
              if (existing >= 0) {
                accumulatedTranslations[existing] = seg;
              } else {
                accumulatedTranslations.push(seg);
              }
            });

            // 保存翻译结果
            await saveTranslatedSubtitle(metadata.resourceId, actualSegments, accumulatedTranslations);
          }
        },
        onCompleted: async () => { }
      });

      // 步骤5: 异步处理翻译
      TranslationService.translateSubtitles(
        {
          requestId,
          chatFn,
          taskLabel,
          segments: actualSegments,
          targetLanguage,
          languageNames,
          metadata,
          options
        },
        emit
      ).catch((err: any) => {
        console.error('翻译失败:', err);
        const resourceId = metadata?.resourceId;
        if (err.message === 'Aborted') {
          emit({ type: 'done', data: { resourceId } });
        } else {
          emit({ type: 'error', data: { message: err?.message || '翻译失败', resourceId } });
        }
      });

      return { requestId, eventsChannel };
    }
  );

  // ==================== 总结相关 ====================

  // 取消总结任务
  ipcMain.handle('ai:cancelSummary', async (_e, payload: { requestId: string }) => {
    const success = SummaryService.cancelSummary(payload.requestId);
    if (success) {
      return { success: true };
    }
    return { success: false, message: 'Task not found' };
  });

  // 获取所有活跃的总结任务
  ipcMain.handle('ai:getSummaryTasks', async () => {
    return SummaryService.getAllActiveSummaries();
  });

  // 字幕/文本总结
  ipcMain.handle(
    'ai:summarize',
    async (
      _e,
      payload: {
        providerId: string;
        model: string;
        content?: string;
        segments?: any[];
        resourceId?: string;
        targetLanguage: string;
        languageNames: Record<string, string>;
        options?: {
          maxChars?: number;
          extractKeyPoints?: boolean;
          extractTimeline?: boolean;
          keywordCount?: number;
          promptTemplate?: string;
        };
        metadata?: Record<string, any>;
      }
    ) => {
      const { providerId, model, content, segments, resourceId, targetLanguage, languageNames, options, metadata = {} } = payload;
      const requestId = randomUUID();
      const eventsChannel = `summary:${requestId}`;
      const taskLabel = `${providerId}/${model}`;

      // 步骤1: 读取内容
      let actualContent: string | any[] = content as string | any[];

      if (!actualContent && resourceId) {
        try {
          actualContent = await loadContentFromResource(resourceId);
        } catch (error) {
          console.error('[summarize] Failed to load content from resource:', error);
          throw error;
        }
      }

      // 如果提供了 segments，使用 segments
      if (!actualContent && segments) {
        actualContent = segments;
      }

      if (!actualContent) {
        throw new Error('No content provided and unable to load content from resourceId');
      }

      // 步骤2: 设置模型和Agent
      const { agent } = await setupModelAndAgent(providerId, model, 'assistant');

      // 步骤3: 创建聊天函数
      const chatFn = createChatFunction(agent);

      // 步骤4: 创建事件发射器
      const emit = createEventEmitter({
        requestId,
        eventType: 'summary',
        busyMessage: '开始总结内容...',
        progressMessage: '正在总结...'
      });

      // 步骤5: 异步处理总结
      SummaryService.summarize(emit, {
        requestId,
        chatFn,
        taskLabel,
        content: actualContent,
        targetLanguage,
        languageNames,
        metadata,
        options
      }).catch((err: any) => {
        console.error('总结失败:', err);
        if (err.message === 'Aborted') {
          emit({ type: 'done' });
        } else {
          emit({ type: 'error', data: { message: err?.message || '总结失败' } });
        }
      });

      return { requestId, eventsChannel };
    }
  );
}
