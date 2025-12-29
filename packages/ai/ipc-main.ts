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
import { clearAllSecrets, clearProviderSecrets as clearSecretsStore, getAllSecrets, setProviderSecrets as setSecretsStore } from './settings-store';
import { getAllInstanceSecrets as getAllInstSecrets, setInstanceSecrets as setInstSecrets } from './settings-store';
import { TaggingService } from './tagging-service';

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

  // 字幕翻译：在主进程中处理，向所有窗口发送消息
  ipcMain.handle(
    'ai:translateSubtitles',
    async (
      _e,
      payload: {
        requestId: string;
        providerId: string;
        model: string;
        segments: Array<{ text: string; index: number }>;
        targetLanguage: string;
        languageNames: Record<string, string>;
      }
    ) => {
      const { requestId, providerId, model, segments, targetLanguage, languageNames } = payload;
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
      setTimeout(async () => {
        try {
          emit({ type: 'connected' });
          emit({ type: 'progress', data: { message: '准备翻译...' } });

          const provider = getProvider(providerId);
          if (!provider || !provider.chat) {
            throw new Error(`Provider ${providerId} not found or does not support chat`);
          }

          // 确保 secrets 已加载
          const schema = provider.getConfigSchema?.();
          const keys = (schema?.fields || []).map((f) => f.key);
          const secrets = await getAllSecrets(providerId, keys);
          if (Object.keys(secrets).length > 0 && provider.setSecrets) {
            await Promise.resolve(provider.setSecrets(secrets));
          }

          // 构建翻译提示词
          const targetLangName = languageNames[targetLanguage] || targetLanguage;
          const segmentsText = segments.map((seg) => `${seg.index + 1}. ${seg.text}`).join('\n');
          const prompt = `请将以下字幕翻译成${targetLangName}，保持原有的编号格式，只返回翻译结果，不要添加任何解释或说明。每个翻译结果占一行，格式为：编号. 翻译文本\n\n${segmentsText}`;

          emit({ type: 'progress', data: { message: '正在连接AI服务...' } });

          let currentTranslation = '';
          let hasReceivedCompleted = false;
          const ctrl = new AbortController();

          // 解析翻译结果的辅助函数
          const parseTranslation = (translation: string): string[] => {
            const lines = translation.split('\n').filter((line: string) => line.trim());
            const translations: string[] = [];

            lines.forEach((line: string) => {
              const match = line.match(/^\d+[\.、\s]+\s*(.+)$/);
              if (match) {
                translations.push(match[1].trim());
              } else if (line.trim()) {
                translations.push(line.trim());
              }
            });

            if (translations.length === 0 && lines.length > 0) {
              translations.push(...lines.map((l) => l.trim()).filter(Boolean));
            }

            return translations;
          };

          // 调用 provider 的 chat 方法进行流式翻译
          const response = await provider.chat(
            {
              messages: [{ role: 'user', content: prompt }],
              providerId,
              extras: { model, secrets },
              stream: true,
              abortId: requestId
            },
            (event: any) => {
              if (event?.type === 'delta' && event.data?.text) {
                currentTranslation += event.data.text;
                emit({ type: 'progress', data: { message: '正在翻译...', translation: currentTranslation } });
              } else if (event?.type === 'message_completed' && event.data?.message?.content) {
                hasReceivedCompleted = true;
                const translation = event.data.message.content.trim();
                emit({ type: 'progress', data: { message: '翻译完成，正在解析结果...' } });

                const translations = parseTranslation(translation);

                emit({
                  type: 'completed',
                  data: {
                    translations,
                    originalTranslation: translation
                  }
                });
              } else if (event?.type === 'error') {
                emit({ type: 'error', data: { message: event.data?.message || '翻译失败' } });
              }
            },
            ctrl.signal
          );

          // 如果没有通过流式事件收到完成消息，使用最终响应
          if (!hasReceivedCompleted && response?.message?.content) {
            const translation = response.message.content.trim();
            const translations = parseTranslation(translation);

            emit({
              type: 'completed',
              data: {
                translations,
                originalTranslation: translation
              }
            });
          }

          emit({ type: 'done' });
        } catch (err: any) {
          console.error('翻译失败:', err);
          emit({ type: 'error', data: { message: err?.message || '翻译失败' } });
        }
      }, 0);

      return { requestId, eventsChannel };
    }
  );
}
