import { randomUUID } from 'node:crypto';

import { BrowserWindow, ipcMain } from 'electron';

import { ChatRepo } from '../common/db';
import { AppEvent, eventManager } from '../event';
import { ChatService } from './chat-service';
import { createPreset, deletePreset, getPreset, getPresetSecrets, listPresets, resolveUsablePreset, setPresetSecrets } from './preset-service';
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
import { createSkillRegistry, getSkillSourceInfo } from './runtime/pi/skills';
import { isMaskedSecretValue, maskSecretConfigValues } from './secret-masking';
import { clearAllSecrets, getAllSecrets, getApiKeys, setProviderSecrets as setSecretsStore } from './settings-store';
import type { ProviderPresetCreatePayload, SpeechSynthesisRequest, TranscriptionRequest } from './types';
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
  const speechSynthesisControllers = new Map<string, AbortController>();
  const speechSynthesisInputs = new Map<
    string,
    {
      enqueue(chunk: { type: 'text'; text: string } | { type: 'flush' } | { type: 'close' }): void;
      close(): void;
    }
  >();
  chat.registerIpc();
  // Register user choice IPC (for ask-user tool)
  registerUserChoiceIpc();

  // Settings & registry inspection
  ipcMain.handle('ai:get-providers', async () => {
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
          // 内置默认配置中的敏感字段（type: 'password'）以掩码下发，明文不进渲染进程
          ...(definition.defaults.config ? { defaultConfig: maskSecretConfigValues({ ...definition.defaults.config }, schema?.fields) } : {}),
          schema
        };
      })
    );
    return rows;
  });

  ipcMain.handle('ai:get-provider-secrets', async (_event, payload: { providerId: string }) => {
    const keys = listProviderSecretKeys(payload.providerId);
    const values = await getAllSecrets(payload.providerId, keys);
    return values;
  });

  ipcMain.handle('ai:set-provider-secrets', async (_event, payload: { providerId: string; secrets: Record<string, string> }) => {
    // 掩码占位值不落库（渲染端约定空值/掩码即未改动）
    const secrets = Object.fromEntries(Object.entries(payload.secrets || {}).filter(([, value]) => !isMaskedSecretValue(value)));
    await setSecretsStore(payload.providerId, secrets);
    const p = getProvider(payload.providerId);
    if (p?.setSecrets) await Promise.resolve(p.setSecrets(secrets));
    eventManager.emit(AppEvent.AI_PROVIDER_CONFIG_UPDATED, {
      providerId: payload.providerId,
      action: 'provider-secrets-updated'
    });
    return { ok: true };
  });

  // Multiple API Keys Management
  ipcMain.handle('ai:get-provider-api-keys', async (_event, payload: { providerId: string; key: string }) => {
    return await getApiKeys(payload.providerId, payload.key);
  });

  ipcMain.handle('ai:clear-all-secrets', async () => {
    await clearAllSecrets();
    // 清理所有 provider 的内存中的 secrets
    const providers = listProviders();
    for (const p of providers) {
      try {
        if (p?.clearSecrets) await Promise.resolve(p.clearSecrets());
        else if (p?.setSecrets) await Promise.resolve(p.setSecrets({}));
      } catch {
        // ignore
      }
    }
    return { ok: true };
  });

  ipcMain.handle('ai:get-agents', async () => {
    return listAgents().map((a) => ({ id: a.id, label: a.label, description: a.description }));
  });

  ipcMain.handle('ai:list-skills', async (_event, payload?: { agentId?: string; workspaceRoot?: string }) => {
    const agentId = typeof payload?.agentId === 'string' ? payload.agentId.trim() : '';
    if (agentId !== 'assistant') {
      return [];
    }

    const workspaceRoot = typeof payload?.workspaceRoot === 'string' && payload.workspaceRoot.trim() ? payload.workspaceRoot.trim() : process.cwd();
    const registry = await createSkillRegistry({
      discoverPluginRoots: true,
      includeBundled: false,
      includeSyntheticToolbox: false,
      workspaceRoot
    });

    return registry
      .listUserInvocable()
      .map((record) => {
        const sourceInfo = getSkillSourceInfo(record);
        return {
          aliases: [...record.aliases],
          argumentHint: record.argumentHint,
          description: record.description,
          name: record.name,
          source: record.source,
          sourceDetail: sourceInfo.detail,
          sourceLabel: sourceInfo.label,
          trustNote: sourceInfo.trustNote,
          trustLevel: sourceInfo.trustLevel,
          whenToUse: record.whenToUse
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));
  });

  ipcMain.handle('ai:transcribe', async (_event, payload: TranscriptionRequest) => {
    return piExecutionService.transcribe(normalizeProviderPreset(payload));
  });

  ipcMain.handle('ai:synthesize-speech', async (_event, payload: SpeechSynthesisRequest) => {
    return piExecutionService.synthesizeSpeech(normalizeProviderPreset(payload));
  });

  ipcMain.handle('ai:stream-speech-synthesis', async (event, payload: SpeechSynthesisRequest) => {
    const requestId = String(payload.extras?.requestId || randomUUID());
    const eventsChannel = `ai:speech-synthesis:${requestId}`;
    const controller = new AbortController();
    speechSynthesisControllers.set(requestId, controller);
    const inputQueue: Array<{ type: 'text'; text: string } | { type: 'flush' } | { type: 'close' }> = [];
    let inputClosed = false;
    let inputWaiter: (() => void) | undefined;
    const wakeInput = (): void => {
      const waiter = inputWaiter;
      inputWaiter = undefined;
      waiter?.();
    };
    const inputController = {
      enqueue(chunk: { type: 'text'; text: string } | { type: 'flush' } | { type: 'close' }): void {
        if (inputClosed) return;
        inputQueue.push(chunk);
        if (chunk.type === 'close') {
          inputClosed = true;
        }
        wakeInput();
      },
      close(): void {
        if (inputClosed) return;
        inputClosed = true;
        inputQueue.push({ type: 'close' });
        wakeInput();
      }
    };
    speechSynthesisInputs.set(requestId, inputController);
    async function* readSpeechInput(): AsyncIterable<{ type: 'text'; text: string } | { type: 'flush' } | { type: 'close' }> {
      while (!inputClosed || inputQueue.length > 0) {
        if (!inputQueue.length) {
          await new Promise<void>((resolve) => {
            inputWaiter = resolve;
          });
          continue;
        }
        const chunk = inputQueue.shift();
        if (!chunk) continue;
        yield chunk;
        if (chunk.type === 'close') break;
      }
    }
    const normalizedPayload = normalizeProviderPreset({
      ...payload,
      extras: {
        ...(payload.extras || {}),
        requestId
      }
    });

    setTimeout(async () => {
      let terminalSent = false;
      try {
        await piExecutionService.streamSpeechSynthesis(
          normalizedPayload,
          (streamEvent) => {
            if (streamEvent.type === 'error' || streamEvent.type === 'done') {
              terminalSent = true;
            }
            event.sender.send(eventsChannel, streamEvent);
          },
          controller.signal,
          readSpeechInput()
        );
      } catch (error) {
        if (!terminalSent) {
          event.sender.send(eventsChannel, {
            type: 'error',
            data: {
              message: error instanceof Error ? error.message : String(error)
            }
          });
          event.sender.send(eventsChannel, { type: 'done' });
        }
      } finally {
        speechSynthesisControllers.delete(requestId);
        speechSynthesisInputs.delete(requestId);
      }
    }, 0);

    return {
      eventsChannel,
      requestId
    };
  });

  ipcMain.handle('ai:cancel-speech-synthesis', async (_event, payload: { requestId: string }) => {
    const controller = speechSynthesisControllers.get(payload.requestId);
    speechSynthesisInputs.get(payload.requestId)?.close();
    if (!controller) {
      return { ok: false };
    }
    controller.abort();
    speechSynthesisControllers.delete(payload.requestId);
    return { ok: true };
  });

  ipcMain.handle('ai:append-speech-synthesis-text', async (_event, payload: { requestId: string; text: string }) => {
    const input = speechSynthesisInputs.get(payload.requestId);
    if (!input) {
      return { ok: false };
    }
    input.enqueue({ type: 'text', text: payload.text || '' });
    return { ok: true };
  });

  ipcMain.handle('ai:flush-speech-synthesis', async (_event, payload: { requestId: string }) => {
    const input = speechSynthesisInputs.get(payload.requestId);
    if (!input) {
      return { ok: false };
    }
    input.enqueue({ type: 'flush' });
    return { ok: true };
  });

  ipcMain.handle('ai:finish-speech-synthesis', async (_event, payload: { requestId: string }) => {
    const input = speechSynthesisInputs.get(payload.requestId);
    if (!input) {
      return { ok: false };
    }
    input.close();
    return { ok: true };
  });

  ipcMain.handle('ai:list-models', async (_event, payload: { providerId: string; presetId?: string }) => {
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
      console.error(err);
      return [];
    }
  });

  // Provider Presets CRUD
  ipcMain.handle('ai:list-presets', async (_event, payload?: { providerId?: string }) => {
    return listPresets(payload?.providerId);
  });
  ipcMain.handle('ai:resolve-usable-preset', async (_event, payload: { providerId: string; preferredPresetId?: string }) => {
    return (await resolveUsablePreset(payload.providerId, payload.preferredPresetId)) || null;
  });
  ipcMain.handle('ai:create-preset', async (_event, payload: ProviderPresetCreatePayload) => {
    const preset = createPreset(payload);
    eventManager.emit(AppEvent.AI_PROVIDER_CONFIG_UPDATED, {
      providerId: preset.providerId,
      presetId: preset.id,
      action: 'preset-created'
    });
    return preset;
  });
  ipcMain.handle('ai:delete-preset', async (_event, payload: { id: string }) => {
    const preset = getPreset(payload.id);
    const ok = await deletePreset(payload.id);
    if (ok) {
      eventManager.emit(AppEvent.AI_PROVIDER_CONFIG_UPDATED, {
        ...(preset?.providerId ? { providerId: preset.providerId } : {}),
        presetId: payload.id,
        action: 'preset-deleted'
      });
    }
    return { ok };
  });
  ipcMain.handle('ai:get-preset-secrets', async (_event, payload: { presetId: string }) => {
    return await getPresetSecrets(payload.presetId);
  });
  ipcMain.handle('ai:set-preset-secrets', async (_event, payload: { presetId: string; secrets: Record<string, string> }) => {
    // 掩码占位值不落库（渲染端约定空值/掩码即未改动）
    const secrets = Object.fromEntries(Object.entries(payload.secrets || {}).filter(([, value]) => !isMaskedSecretValue(value)));
    await setPresetSecrets(payload.presetId, secrets);
    const preset = getPreset(payload.presetId);
    eventManager.emit(AppEvent.AI_PROVIDER_CONFIG_UPDATED, {
      ...(preset?.providerId ? { providerId: preset.providerId } : {}),
      presetId: payload.presetId,
      action: 'preset-secrets-updated'
    });
    return { ok: true };
  });

  // Prompt Templates CRUD
  ipcMain.handle('ai:list-prompt-templates', async () => PromptsStore.list());
  ipcMain.handle('ai:create-prompt-template', async (_event, payload: { name: string; type: 'system' | 'user'; content: string; tags?: string[] }) => PromptsStore.create(payload));
  ipcMain.handle('ai:update-prompt-template', async (_event, payload: { id: string; patch: any }) => PromptsStore.update(payload.id, payload.patch));
  ipcMain.handle('ai:delete-prompt-template', async (_event, payload: { id: string }) => ({ ok: PromptsStore.delete(payload.id) }));

  // Conversations & Messages (history)
  ipcMain.handle('ai:list-conversations', async (_event, payload?: { includeDeleted?: boolean; limit?: number; offset?: number }) => {
    const rows = await ChatRepo.listConversations({ includeDeleted: payload?.includeDeleted }, payload?.limit ?? 200, payload?.offset ?? 0);
    return rows;
  });
  ipcMain.handle('ai:list-messages', async (_event, payload: { conversationId: string; limit?: number; offset?: number }) => {
    return ChatRepo.listMessages(payload.conversationId, payload?.limit ?? 2000, payload?.offset ?? 0);
  });
  ipcMain.handle('ai:rename-conversation', async (_event, payload: { id: string; title: string }) => {
    const row = await ChatRepo.renameConversation(payload.id, payload.title);
    return row ? { ok: true, row } : { ok: false };
  });
  ipcMain.handle('ai:hard-delete-conversation', async (_event, payload: { id: string }) => {
    const ok = await ChatRepo.deleteConversation(payload.id);
    return { ok };
  });
}
