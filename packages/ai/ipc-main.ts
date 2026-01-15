import { randomUUID } from 'crypto';
import { BrowserWindow, ipcMain } from 'electron';

import { ChatRepo } from '../common/db';
import { BasicAgent } from './agents/basic';
import { RAGAgent } from './agents/rag';
import { TaggerAgent } from './agents/tagger';
import { ChatService } from './chat-service';
import { InstancesStore } from './instances-store';
import { PromptsStore } from './prompts-store';
import { AnthropicProvider } from './providers/anthropic';
import { DeepSeekProvider } from './providers/deepseek';
import { GeminiProvider } from './providers/gemini';
import { OllamaProvider } from './providers/ollama';
import { OpenAIProvider } from './providers/openai';
import { QwenProvider } from './providers/qwen';
import { ZhipuProvider } from './providers/zhipu';
import { getProvider, listAgents, listProviders, registerAgent, registerProvider } from './registry';
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
import { getAllInstanceSecrets as getAllInstSecrets, setInstanceSecrets as setInstSecrets } from './settings-store';
import { TaggingService } from './tagging-service';
import { TranslationService } from './translation-service';

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

  // 获取服务商翻译状态
  ipcMain.handle('ai:getProviderTranslationStatus', async (_e, payload: { providerId: string }) => {
    const activeRequests = TranslationService.getProviderActiveRequests(payload.providerId);
    return { busy: activeRequests.length > 0, activeRequests };
  });

  // 获取所有活跃的翻译任务
  ipcMain.handle('ai:getTranslationTasks', async () => {
    const tasks = TranslationService.getAllActiveTranslations();
    // 移除 controller 对象，因为它不能被序列化
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return tasks.map(({ controller, ...rest }) => rest);
  });

  // 获取指定任务已翻译的片段
  ipcMain.handle('ai:getTranslatedSegments', async (_e, payload: { requestId: string }) => {
    return TranslationService.getTranslatedSegments(payload.requestId);
  });

  // 字幕翻译：在主进程中处理，向所有窗口发送消息
  ipcMain.handle(
    'ai:translate',
    async (
      _e,
      payload: {
        providerId: string;
        model: string;
        segments: any[];
        targetLanguage: string;
        languageNames: Record<string, string>;
        force?: boolean;
        metadata?: Record<string, any>;
      }
    ) => {
      const requestId = randomUUID();
      const eventsChannel = `subtitle:translate:${requestId}`;

      // 向所有窗口发送消息的函数
      const emit = (event: { type: string; data?: any }): void => {
        BrowserWindow.getAllWindows().forEach((w) => {
          if (!w.isDestroyed()) {
            try {
              w.webContents.send('renderer-message', {
                type: 'subtitle:translate',
                data: { requestId, ...event }
              });
            } catch (error) {
              console.error('发送翻译消息失败:', error);
            }
          }
        });
      };

      // 异步处理翻译
      TranslationService.translateSubtitles({ ...payload, requestId }, emit)
        .catch((err: any) => {
          console.error('翻译失败:', err);
          const resourceId = payload.metadata?.resourceId;
          // 如果是手动取消，可能不需要发送 error 事件，或者发送特定的 cancel 事件
          if (err.message === 'Aborted') {
            emit({ type: 'done', data: { resourceId } }); // 或者发送一个 cancelled 事件
          } else {
            emit({ type: 'error', data: { message: err?.message || '翻译失败', resourceId } });
          }
        })
        .then(() => {
          // 成功完成也发送 done
          // 注意：translateSubtitles 如果成功返回，说明翻译完成
          // 但是 translateSubtitles 是 void，且如果出错会抛出
          // 所以这里应该是 .then() 处理成功情况
          // 但是 translateSubtitles 内部没有 emit('done')?
          // 让我们检查 TranslationService.ts
        });

      return { requestId, eventsChannel };
    }
  );
}
