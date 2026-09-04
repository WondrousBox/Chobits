import { ipcRenderer } from 'electron';

import { normalizeProviderPreset } from './provider-preset';
import type { ConversationRecord, ProviderPresetCreatePayload, SpeechSynthesisRequest, SpeechSynthesisStreamEvent, TranscriptionRequest, UserChoiceResponse } from './types';

export type StreamCallback = (event: { type: string; data?: any }) => void;

export const aiBridge = {
  async getProviders() {
    return ipcRenderer.invoke('ai:get-providers');
  },
  async getAgents() {
    return ipcRenderer.invoke('ai:get-agents');
  },
  async listSkills(payload?: { agentId?: string; workspaceRoot?: string }) {
    return ipcRenderer.invoke('ai:list-skills', payload || {});
  },
  async listModels(providerId: string, presetId?: string) {
    return ipcRenderer.invoke('ai:list-models', { presetId, providerId });
  },
  async getProviderSecrets(providerId: string) {
    return ipcRenderer.invoke('ai:get-provider-secrets', { providerId });
  },
  async setProviderSecrets(providerId: string, secrets: Record<string, string>) {
    return ipcRenderer.invoke('ai:set-provider-secrets', { providerId, secrets });
  },
  // Multiple API Keys Management
  async getProviderApiKeys(providerId: string, key: string) {
    return ipcRenderer.invoke('ai:get-provider-api-keys', { providerId, key });
  },
  async clearAllSecrets() {
    return ipcRenderer.invoke('ai:clear-all-secrets');
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
    return ipcRenderer.invoke('ai:synthesize-speech', normalizeProviderPreset(payload));
  },
  async streamSpeechSynthesis(payload: SpeechSynthesisRequest, onEvent?: (ev: SpeechSynthesisStreamEvent) => void) {
    const normalizedPayload = normalizeProviderPreset({
      ...payload,
      mode: payload.mode || 'output-stream',
      transportPreference: payload.transportPreference || 'http-stream'
    });
    const res = await ipcRenderer.invoke('ai:stream-speech-synthesis', normalizedPayload);
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
        return ipcRenderer.invoke('ai:append-speech-synthesis-text', { requestId: res.requestId, text });
      },
      on(cb: (ev: SpeechSynthesisStreamEvent) => void) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      off(cb: (ev: SpeechSynthesisStreamEvent) => void) {
        listeners.delete(cb);
      },
      dispose: cleanup,
      cancel: () => ipcRenderer.invoke('ai:cancel-speech-synthesis', { requestId: res.requestId }),
      finish: () => ipcRenderer.invoke('ai:finish-speech-synthesis', { requestId: res.requestId }),
      flush: () => ipcRenderer.invoke('ai:flush-speech-synthesis', { requestId: res.requestId })
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
  async chatStream(payload: any, onEvent?: StreamCallback) {
    const normalizedPayload = normalizeProviderPreset({
      ...payload,
      extras: {
        ...(payload.extras || {}),
        runtime: 'pi' // 强制使用 Pi 运行时以获得更好的流式支持和元数据
      }
    });
    const res = await ipcRenderer.invoke('ai:chat-stream', normalizedPayload);
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
  // Presets
  async listPresets(providerId?: string) {
    return ipcRenderer.invoke('ai:list-presets', { providerId });
  },
  async resolveUsablePreset(providerId: string, preferredPresetId?: string) {
    return ipcRenderer.invoke('ai:resolve-usable-preset', { providerId, preferredPresetId });
  },
  async createPreset(payload: ProviderPresetCreatePayload) {
    return ipcRenderer.invoke('ai:create-preset', payload);
  },
  async deletePreset(id: string) {
    return ipcRenderer.invoke('ai:delete-preset', { id });
  },
  async getPresetSecrets(presetId: string) {
    return ipcRenderer.invoke('ai:get-preset-secrets', { presetId });
  },
  async setPresetSecrets(presetId: string, secrets: Record<string, string>) {
    return ipcRenderer.invoke('ai:set-preset-secrets', { presetId, secrets });
  },
  // Prompt templates
  async listPromptTemplates() {
    return ipcRenderer.invoke('ai:list-prompt-templates');
  },
  async createPromptTemplate(payload: { name: string; type: 'system' | 'user'; content: string; tags?: string[] }) {
    return ipcRenderer.invoke('ai:create-prompt-template', payload);
  },
  async updatePromptTemplate(id: string, patch: any) {
    return ipcRenderer.invoke('ai:update-prompt-template', { id, patch });
  },
  async deletePromptTemplate(id: string) {
    return ipcRenderer.invoke('ai:delete-prompt-template', { id });
  },
  // Conversations & messages
  async listConversations(payload?: { includeDeleted?: boolean; limit?: number; offset?: number }): Promise<ConversationRecord[]> {
    return ipcRenderer.invoke('ai:list-conversations', payload);
  },
  async listMessages(conversationId: string, limit?: number, offset?: number) {
    return ipcRenderer.invoke('ai:list-messages', { conversationId, limit, offset });
  },
  async renameConversation(id: string, title: string): Promise<{ ok: boolean; row?: ConversationRecord }> {
    return ipcRenderer.invoke('ai:rename-conversation', { id, title });
  },
  async hardDeleteConversation(id: string) {
    return ipcRenderer.invoke('ai:hard-delete-conversation', { id });
  },
  /** Subscribe to conversation title updates pushed from main process */
  onConversationTitleUpdated(callback: (data: { conversationId: string; title: string | null; status: 'generating' | 'done' | 'error' }) => void) {
    const handler = (_: any, data: any): void => callback(data);
    ipcRenderer.on('ai:conversation-title-updated', handler);
    return () => ipcRenderer.removeListener('ai:conversation-title-updated', handler);
  },
  /** Send user's choice response back to main process (for ask-user tool) */
  async sendUserChoiceResponse(response: UserChoiceResponse) {
    return ipcRenderer.invoke('ai:user-choice-response', response);
  }
};

export default aiBridge;
