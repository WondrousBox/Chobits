import { BrowserWindow, ipcMain } from 'electron';

import { cleanupMemoryForConversations as cleanupMemoryForDeletedConversations } from '../../electron/main/handlers/memory/memory-cleanup';
import { ChatRepo } from '../common/db';
import { pushCardToWindows } from './card-push';
import { ChatService } from './chat-service';
import { GlossaryStore } from './glossary-store';
import {
  cancelMindmap,
  cleanupTranslationResources,
  deleteTranslationSegment,
  executeMindmap,
  executeSubtitleTranslation,
  executeSummarize,
  insertTranslationSegment,
  loadAllTranslationHistory,
  loadResourceMindmap,
  loadResourceNote,
  loadResourceSummary,
  loadTranslatedSubtitles,
  saveResourceNote,
  SummarizePayload,
  TranslatePayload,
  updateTranslationSegment
} from './ipc-handler-helpers';
import { createPreset, deletePreset, getPreset, getPresetSecrets, listPresets, resolveUsablePreset, setPresetSecrets, updatePreset } from './preset-service';
import { PromptsStore } from './prompts-store';
import { normalizeProviderPreset } from './provider-preset';
import { registerBuiltInProviders } from './providers/catalog';
import { registerProviderPluginDefinitions } from './providers/plugins/loader';
import {
  getProviderCapabilities,
  getProviderDefaultModels,
  getProviderDefinitionSchema,
  listProviderDefinitionAliases,
  listProviderDefinitions,
  listProviderSecretKeys,
  supportsProviderCapability
} from './providers/service';
import { getProvider, listAgents, listProviders } from './registry';
import { PiExecutionService } from './runtime/pi/execution-service';
import { SummaryService } from './services/summary-service';
import { TaggingService } from './services/tagging-service';
import { TranslationService } from './services/translation-service';
import {
  addApiKey,
  clearAllSecrets,
  clearProviderSecrets as clearSecretsStore,
  getAllSecrets,
  getApiKeys,
  removeApiKey,
  setApiKeys,
  setDefaultApiKey,
  setProviderSecrets as setSecretsStore,
  updateApiKey
} from './settings-store';
import { listToolInfos } from './tools';
import type { ImageGenerationRequest, ProviderPresetCreatePayload, ProviderPresetUpdatePatch, PushedCard, TranscriptionRequest } from './types';
import { registerUserChoiceIpc } from './user-choice-registry';

async function hasUsablePreset(providerId: string): Promise<boolean> {
  return !!(await resolveUsablePreset(providerId));
}

export async function initAIHandlers(win: BrowserWindow): Promise<void> {
  // Bootstrapping built-in providers
  registerBuiltInProviders();
  const pluginLoadResult = await registerProviderPluginDefinitions();
  for (const warning of pluginLoadResult.warnings) {
    const location = warning.path ? `${warning.path}: ` : '';
    console.warn(`[ai][provider-plugin] ${location}${warning.message}`);
  }

  const chat = new ChatService(win);
  const piExecutionService = new PiExecutionService();
  chat.registerIpc();
  // Register AI utility IPCs (e.g., auto-tagging)
  TaggingService.registerIpc();
  // Register user choice IPC (for ask-user tool)
  registerUserChoiceIpc();

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
    const definitions = listProviderDefinitions();
    const rows = await Promise.all(
      definitions.map(async (definition) => {
        const provider = getProvider(definition.id);
        const defaultModels = getProviderDefaultModels(definition.id, provider);
        const capabilities = getProviderCapabilities(definition.id, provider);
        const schema = getProviderDefinitionSchema(definition.id);

        return {
          id: definition.id,
          aliases: listProviderDefinitionAliases(definition.id),
          label: definition.display.label,
          source: definition.source,
          configured: await hasUsablePreset(definition.id),
          capabilities,
          defaultModels,
          kind: definition.protocol.kind,
          defaultModel: definition.defaults.models.chat || defaultModels.chat,
          schema
        };
      })
    );
    return rows;
  });

  ipcMain.handle('ai:getProviderSecrets', async (_e, payload: { providerId: string }) => {
    const keys = listProviderSecretKeys(payload.providerId);
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

  // 列出所有可用工具
  ipcMain.handle('ai:listTools', async () => {
    return listToolInfos();
  });

  ipcMain.handle('ai:transcribe', async (_e, payload: TranscriptionRequest) => {
    return piExecutionService.transcribe(normalizeProviderPreset(payload));
  });

  ipcMain.handle('ai:generateImage', async (_e, payload: ImageGenerationRequest) => {
    return piExecutionService.generateImage(normalizeProviderPreset(payload));
  });

  ipcMain.handle('ai:listModels', async (_e, payload: { providerId: string; presetId?: string }) => {
    const preset = getPreset(payload.presetId);
    const resolvedProviderId = preset?.providerId || payload.providerId;
    const p = getProvider(resolvedProviderId);
    if (!p) return [];
    try {
      if (supportsProviderCapability(p.id, 'modelListing', p) && p.listModels) {
        let opts: any = undefined;
        if (preset) {
          opts = { secrets: await getPresetSecrets(preset.id) };
        }
        return await Promise.resolve(p.listModels(opts));
      }
      return [];
    } catch (err) {
      console.log(err);
      return [];
    }
  });

  // Provider Presets CRUD
  ipcMain.handle('ai:listPresets', async (_e, payload?: { providerId?: string }) => {
    return listPresets(payload?.providerId);
  });
  ipcMain.handle('ai:resolveUsablePreset', async (_e, payload: { providerId: string; preferredPresetId?: string }) => {
    return (await resolveUsablePreset(payload.providerId, payload.preferredPresetId)) || null;
  });
  ipcMain.handle('ai:createPreset', async (_e, payload: ProviderPresetCreatePayload) => {
    return createPreset(payload);
  });
  ipcMain.handle('ai:updatePreset', async (_e, payload: { id: string; patch: ProviderPresetUpdatePatch }) => {
    return updatePreset(payload.id, payload.patch);
  });
  ipcMain.handle('ai:deletePreset', async (_e, payload: { id: string }) => {
    return { ok: await deletePreset(payload.id) };
  });
  ipcMain.handle('ai:getPresetSecrets', async (_e, payload: { presetId: string }) => {
    return await getPresetSecrets(payload.presetId);
  });
  ipcMain.handle('ai:setPresetSecrets', async (_e, payload: { presetId: string; secrets: Record<string, string> }) => {
    await setPresetSecrets(payload.presetId, payload.secrets);
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
  ipcMain.handle('ai:hardDeleteConversation', async (_e, payload: { id: string }) => {
    const ok = await ChatRepo.deleteConversation(payload.id);
    // 异步清理关联记忆（不阻塞删除操作）
    cleanupMemoryForDeletedConversations([payload.id]);
    return { ok };
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
  ipcMain.handle('ai:translate', async (_e, payload: TranslatePayload) => {
    return executeSubtitleTranslation(payload);
  });

  // 获取资源的翻译历史（每种语言最新的一个）
  ipcMain.handle('ai:getResourceTranslations', async (_e, payload: { resourceId: string }) => {
    return loadTranslatedSubtitles(payload.resourceId);
  });

  // 获取资源的所有翻译历史（包括同语言的多个版本）
  ipcMain.handle('ai:getAllTranslationHistory', async (_e, payload: { resourceId: string }) => {
    return loadAllTranslationHistory(payload.resourceId);
  });

  // 更新翻译 JSON 中某片段（时间或文本，时间轴拖拽/编辑后写回）
  ipcMain.handle(
    'ai:updateTranslationSegment',
    async (_e, payload: { subtitleResourceId: string; translationEntryId: string; segmentIndex: number; patch: { st?: string; et?: string; text?: string } }) => {
      return updateTranslationSegment(payload);
    }
  );

  // 在翻译 JSON 中插入新片段（翻译轨道空白处新增字幕块后保存）
  ipcMain.handle(
    'ai:insertTranslationSegment',
    async (_e, payload: { subtitleResourceId: string; translationEntryId: string; insertIndex: number; segment: { st: string; et: string; text: string } }) => {
      return insertTranslationSegment(payload);
    }
  );

  ipcMain.handle('ai:deleteTranslationSegment', async (_e, payload: { subtitleResourceId: string; translationEntryId: string; segmentIndex: number }) => {
    return deleteTranslationSegment(payload);
  });

  // 清理数据库中的翻译类型资源（迁移到项目文件夹后的清理）
  ipcMain.handle('ai:cleanupTranslationResources', async (_e, payload: { subtitleResourceId?: string }) => {
    return cleanupTranslationResources(payload.subtitleResourceId);
  });

  // ==================== 总结相关 ====================

  // 取消总结任务
  ipcMain.handle('ai:cancelSummary', async (_e, payload: { requestId: string }) => {
    const success = SummaryService.cancelSummary(payload.requestId);
    if (success) {
      return { ok: true };
    }
    return { ok: false, message: 'Task not found' };
  });

  // 获取所有活跃的总结任务
  ipcMain.handle('ai:getSummaryTasks', async () => {
    return SummaryService.getAllActiveSummaries();
  });

  // 字幕/文本总结
  ipcMain.handle('ai:summarize', async (_e, payload: SummarizePayload) => {
    return executeSummarize(payload);
  });

  // 获取资源的总结数据
  ipcMain.handle('ai:getResourceSummary', async (_e, payload: { resourceId: string }) => {
    return loadResourceSummary(payload.resourceId);
  });

  // 获取资源的脑图数据
  ipcMain.handle('ai:getResourceMindmap', async (_e, payload: { resourceId: string }) => {
    return loadResourceMindmap(payload.resourceId);
  });

  // 脑图生成
  ipcMain.handle('ai:generateMindmap', async (_e, payload: any) => {
    return executeMindmap(payload);
  });

  // 取消脑图生成
  ipcMain.handle('ai:cancelMindmap', async (_e, payload: { requestId: string }) => {
    return { ok: cancelMindmap(payload.requestId) };
  });

  // ==================== 笔记相关 ====================

  // 保存笔记
  ipcMain.handle('ai:saveNote', async (_e, payload: { resourceId: string; content: string; title?: string }) => {
    return saveResourceNote(payload);
  });

  // 获取笔记
  ipcMain.handle('ai:getResourceNote', async (_e, payload: { resourceId: string }) => {
    return loadResourceNote(payload.resourceId);
  });

  // ==================== 卡片推送 ====================

  /**
   * Push a card to chat window(s)
   * Can target specific conversation or broadcast to all windows
   */
  ipcMain.handle('ai:pushCard', async (_e, payload: { card: Omit<PushedCard, 'timestamp'>; targetWindowId?: number }) => {
    pushCardToWindows(payload.card, payload.targetWindowId);
    return { success: true };
  });
}
