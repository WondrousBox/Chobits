import { ipcRenderer } from 'electron';

import { normalizeProviderPreset } from './provider-preset';
import type {
  ConversationRecord,
  EmbeddingRequest,
  ProviderPresetCreatePayload,
  ProviderPresetUpdatePatch,
  PushedCard,
  SpeechSynthesisStreamEvent,
  SpeechSynthesisRequest,
  TranscriptionRequest,
  UserChoiceResponse
} from './types';

export type StreamCallback = (event: { type: string; data?: any }) => void;

export const aiBridge = {
  async getProviders() {
    return ipcRenderer.invoke('ai:getProviders');
  },
  async getAgents() {
    return ipcRenderer.invoke('ai:getAgents');
  },
  async listTools(): Promise<Array<{ id: string; name: string; description: string }>> {
    return ipcRenderer.invoke('ai:listTools');
  },
  async listSkills(payload?: { agentId?: string; workspaceRoot?: string }) {
    return ipcRenderer.invoke('ai:listSkills', payload || {});
  },
  async listModels(providerId: string, presetId?: string) {
    return ipcRenderer.invoke('ai:listModels', { presetId, providerId });
  },
  async getProviderSecrets(providerId: string) {
    return ipcRenderer.invoke('ai:getProviderSecrets', { providerId });
  },
  async setProviderSecrets(providerId: string, secrets: Record<string, string>) {
    return ipcRenderer.invoke('ai:setProviderSecrets', { providerId, secrets });
  },
  async clearProviderSecrets(providerId: string) {
    return ipcRenderer.invoke('ai:clearProviderSecrets', { providerId });
  },
  // Multiple API Keys Management
  async getProviderApiKeys(providerId: string, key: string) {
    return ipcRenderer.invoke('ai:getProviderApiKeys', { providerId, key });
  },
  async setProviderApiKeys(providerId: string, key: string, keys: Array<{ name: string; value: string; isDefault?: boolean }>) {
    return ipcRenderer.invoke('ai:setProviderApiKeys', { providerId, key, keys });
  },
  async addProviderApiKey(providerId: string, key: string, apiKey: { name: string; value: string }) {
    return ipcRenderer.invoke('ai:addProviderApiKey', { providerId, key, apiKey });
  },
  async updateProviderApiKey(providerId: string, key: string, apiKeyName: string, updates: Partial<{ name: string; value: string; isDefault: boolean }>) {
    return ipcRenderer.invoke('ai:updateProviderApiKey', { providerId, key, apiKeyName, updates });
  },
  async removeProviderApiKey(providerId: string, key: string, apiKeyName: string) {
    return ipcRenderer.invoke('ai:removeProviderApiKey', { providerId, key, apiKeyName });
  },
  async setDefaultProviderApiKey(providerId: string, key: string, apiKeyName: string) {
    return ipcRenderer.invoke('ai:setDefaultProviderApiKey', { providerId, key, apiKeyName });
  },
  async clearAllSecrets() {
    return ipcRenderer.invoke('ai:clearAllSecrets');
  },
  async transcribe(payload: TranscriptionRequest) {
    // If file is Blob, convert to Buffer/ArrayBuffer before sending over IPC
    let fileToSend = payload.file;
    if (payload.file instanceof Blob) {
      const arrayBuffer = await payload.file.arrayBuffer();
      fileToSend = Buffer.from(arrayBuffer);
    } else if (payload.file instanceof ArrayBuffer) {
      fileToSend = Buffer.from(payload.file);
    }
    return ipcRenderer.invoke('ai:transcribe', { ...normalizeProviderPreset(payload), file: fileToSend });
  },
  async synthesizeSpeech(payload: SpeechSynthesisRequest) {
    return ipcRenderer.invoke('ai:synthesizeSpeech', normalizeProviderPreset(payload));
  },
  async streamSpeechSynthesis(payload: SpeechSynthesisRequest, onEvent?: (ev: SpeechSynthesisStreamEvent) => void) {
    const normalizedPayload = normalizeProviderPreset({
      ...payload,
      mode: payload.mode || 'output-stream',
      transportPreference: payload.transportPreference || 'http-stream'
    });
    const res = await ipcRenderer.invoke('ai:streamSpeechSynthesis', normalizedPayload);
    const channel: string = res.eventsChannel;
    const listeners = new Set<(ev: SpeechSynthesisStreamEvent) => void>();
    const handler = (_event: any, ev: SpeechSynthesisStreamEvent): void => {
      listeners.forEach((cb) => {
        try {
          cb(ev);
        } catch {
          //
        }
      });
    };
    ipcRenderer.on(channel, handler);

    if (onEvent) listeners.add(onEvent);

    const cleanup = (): void => {
      try {
        ipcRenderer.off(channel, handler);
      } catch {
        //
      }
      listeners.clear();
    };
    const api = {
      requestId: res.requestId as string,
      appendText(text: string) {
        return ipcRenderer.invoke('ai:appendSpeechSynthesisText', { requestId: res.requestId, text });
      },
      on(cb: (ev: SpeechSynthesisStreamEvent) => void) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      off(cb: (ev: SpeechSynthesisStreamEvent) => void) {
        listeners.delete(cb);
      },
      dispose: cleanup,
      cancel: () => ipcRenderer.invoke('ai:cancelSpeechSynthesis', { requestId: res.requestId }),
      finish: () => ipcRenderer.invoke('ai:finishSpeechSynthesis', { requestId: res.requestId }),
      flush: () => ipcRenderer.invoke('ai:flushSpeechSynthesis', { requestId: res.requestId })
    };
    const autoCleanup = (ev: SpeechSynthesisStreamEvent): void => {
      if (ev?.type === 'done' || ev?.type === 'error') {
        cleanup();
        api.off(autoCleanup);
      }
    };
    listeners.add(autoCleanup);

    return api;
  },
  async chat(payload: any) {
    return ipcRenderer.invoke('ai:chat', normalizeProviderPreset(payload));
  },
  async chatEphemeral(payload: any) {
    return ipcRenderer.invoke('ai:chatEphemeral', normalizeProviderPreset(payload));
  },
  async chatStream(payload: any, onEvent?: StreamCallback) {
    const normalizedPayload = normalizeProviderPreset({
      ...payload,
      extras: {
        ...(payload.extras || {}),
        runtime: 'pi' // 强制使用 Pi 运行时以获得更好的流式支持和元数据
      }
    });
    normalizedPayload.extras = {
      ...(normalizedPayload.extras || {}),
      runtime: 'pi' // 强制使用 Pi 运行时以获得更好的流式支持和元数据
    };
    const res = await ipcRenderer.invoke('ai:chatStream', normalizedPayload);
    const channel: string = res.eventsChannel;
    const listeners = new Set<StreamCallback>();
    const handler = (_event: any, ev: any): void => {
      // fan out to all listeners
      listeners.forEach((cb) => {
        try {
          cb(ev);
        } catch {
          //
        }
      });
    };
    ipcRenderer.on(channel, handler);

    // if a single callback passed, register it
    if (onEvent) listeners.add(onEvent);

    const cleanup = (): void => {
      try {
        ipcRenderer.off(channel, handler);
      } catch {
        //
      }
      listeners.clear();
    };

    const api = {
      requestId: res.requestId as string,
      on(cb: StreamCallback) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      off(cb: StreamCallback) {
        listeners.delete(cb);
      },
      dispose: cleanup,
      cancel: () => ipcRenderer.invoke('ai:cancel', { requestId: res.requestId })
    };

    const autoCleanup = (ev: any): void => {
      if (ev?.type === 'done' || ev?.type === 'error') {
        cleanup();
        api.off(autoCleanup as any);
      }
    };
    listeners.add(autoCleanup as any);

    return api;
  },
  async embed(payload: EmbeddingRequest) {
    return ipcRenderer.invoke('ai:embed', normalizeProviderPreset(payload));
  },
  // Presets
  async listPresets(providerId?: string) {
    return ipcRenderer.invoke('ai:listPresets', { providerId });
  },
  async resolveUsablePreset(providerId: string, preferredPresetId?: string) {
    return ipcRenderer.invoke('ai:resolveUsablePreset', { providerId, preferredPresetId });
  },
  async createPreset(payload: ProviderPresetCreatePayload) {
    return ipcRenderer.invoke('ai:createPreset', payload);
  },
  async updatePreset(id: string, patch: ProviderPresetUpdatePatch) {
    return ipcRenderer.invoke('ai:updatePreset', { id, patch });
  },
  async deletePreset(id: string) {
    return ipcRenderer.invoke('ai:deletePreset', { id });
  },
  async getPresetSecrets(presetId: string) {
    return ipcRenderer.invoke('ai:getPresetSecrets', { presetId });
  },
  async setPresetSecrets(presetId: string, secrets: Record<string, string>) {
    return ipcRenderer.invoke('ai:setPresetSecrets', { presetId, secrets });
  },
  // Prompt templates
  async listPromptTemplates() {
    return ipcRenderer.invoke('ai:listPromptTemplates');
  },
  async createPromptTemplate(payload: { name: string; type: 'system' | 'user'; content: string; tags?: string[] }) {
    return ipcRenderer.invoke('ai:createPromptTemplate', payload);
  },
  async updatePromptTemplate(id: string, patch: any) {
    return ipcRenderer.invoke('ai:updatePromptTemplate', { id, patch });
  },
  async deletePromptTemplate(id: string) {
    return ipcRenderer.invoke('ai:deletePromptTemplate', { id });
  },
  // Conversations & messages
  async listConversations(payload?: { includeDeleted?: boolean; limit?: number; offset?: number }): Promise<ConversationRecord[]> {
    return ipcRenderer.invoke('ai:listConversations', payload);
  },
  async listMessages(conversationId: string, limit?: number, offset?: number) {
    return ipcRenderer.invoke('ai:listMessages', { conversationId, limit, offset });
  },
  async renameConversation(id: string, title: string): Promise<{ ok: boolean; row?: ConversationRecord }> {
    return ipcRenderer.invoke('ai:renameConversation', { id, title });
  },
  async deleteConversation(id: string) {
    return ipcRenderer.invoke('ai:deleteConversation', { id });
  },
  async restoreConversation(id: string) {
    return ipcRenderer.invoke('ai:restoreConversation', { id });
  },
  async hardDeleteConversation(id: string) {
    return ipcRenderer.invoke('ai:hardDeleteConversation', { id });
  },
  /** Subscribe to conversation title updates pushed from main process */
  onConversationTitleUpdated(callback: (data: { conversationId: string; title: string | null; status: 'generating' | 'done' | 'error' }) => void) {
    const handler = (_: any, data: any): void => callback(data);
    ipcRenderer.on('ai:conversation-title-updated', handler);
    return () => ipcRenderer.removeListener('ai:conversation-title-updated', handler);
  },
  /** Subscribe to card push events from main process */
  onCardPushed(callback: (card: PushedCard) => void) {
    const handler = (_: any, card: PushedCard): void => callback(card);
    ipcRenderer.on('ai:card-pushed', handler);
    return () => ipcRenderer.removeListener('ai:card-pushed', handler);
  },
  /** Send user's choice response back to main process (for ask-user tool) */
  async sendUserChoiceResponse(response: UserChoiceResponse) {
    return ipcRenderer.invoke('ai:userChoiceResponse', response);
  }
};

export default aiBridge;
