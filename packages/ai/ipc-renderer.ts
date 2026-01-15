import { ipcRenderer } from 'electron';

export type StreamCallback = (event: { type: string; data?: any }) => void;

export const aiBridge = {
  async getProviders() {
    return ipcRenderer.invoke('ai:getProviders');
  },
  async getAgents() {
    return ipcRenderer.invoke('ai:getAgents');
  },
  async listModels(providerId: string, instanceId?: string) {
    return ipcRenderer.invoke('ai:listModels', { providerId, instanceId });
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
  async transcribe(payload: { providerId: string; file: Blob | Buffer; model?: string; language?: string; prompt?: string }) {
    // If file is Blob, convert to Buffer/ArrayBuffer before sending over IPC
    let fileToSend = payload.file;
    if (payload.file instanceof Blob) {
      const arrayBuffer = await payload.file.arrayBuffer();
      fileToSend = Buffer.from(arrayBuffer);
    }
    return ipcRenderer.invoke('ai:transcribe', { ...payload, file: fileToSend });
  },
  async chat(payload: any) {
    return ipcRenderer.invoke('ai:chat', payload);
  },
  async chatEphemeral(payload: any) {
    return ipcRenderer.invoke('ai:chatEphemeral', payload);
  },
  async chatStream(payload: any, onEvent?: StreamCallback) {
    const res = await ipcRenderer.invoke('ai:chatStream', payload);
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

    // auto cleanup on end-like events
    const autoCleanup = (ev: any): void => {
      if (ev?.type === 'done' || ev?.type === 'error') {
        cleanup();
        api.off(autoCleanup as any);
      }
    };
    listeners.add(autoCleanup as any);

    return api;
  },
  async chatStreamEphemeral(payload: any, onEvent?: StreamCallback) {
    const res = await ipcRenderer.invoke('ai:chatStreamEphemeral', payload);
    const channel: string = res.eventsChannel;
    const listeners = new Set<StreamCallback>();
    const handler = (_event: any, ev: any): void => {
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
  async embed(payload: { texts: string[]; providerId?: string; model?: string; normalize?: boolean }) {
    return ipcRenderer.invoke('ai:embed', payload);
  },
  // Instances
  async listInstances(providerId?: string) {
    return ipcRenderer.invoke('ai:listInstances', { providerId });
  },
  async createInstance(payload: { providerId: string; name: string; model?: string; systemPrompt?: string; config?: Record<string, any> }) {
    return ipcRenderer.invoke('ai:createInstance', payload);
  },
  async updateInstance(id: string, patch: any) {
    return ipcRenderer.invoke('ai:updateInstance', { id, patch });
  },
  async deleteInstance(id: string) {
    return ipcRenderer.invoke('ai:deleteInstance', { id });
  },
  async getInstanceSecrets(instanceId: string) {
    return ipcRenderer.invoke('ai:getInstanceSecrets', { instanceId });
  },
  async setInstanceSecrets(instanceId: string, secrets: Record<string, string>) {
    return ipcRenderer.invoke('ai:setInstanceSecrets', { instanceId, secrets });
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
  async listConversations(payload?: { includeDeleted?: boolean; limit?: number; offset?: number }) {
    return ipcRenderer.invoke('ai:listConversations', payload);
  },
  async listMessages(conversationId: string, limit?: number, offset?: number) {
    return ipcRenderer.invoke('ai:listMessages', { conversationId, limit, offset });
  },
  async renameConversation(id: string, title: string) {
    return ipcRenderer.invoke('ai:renameConversation', { id, title });
  },
  async deleteConversation(id: string) {
    return ipcRenderer.invoke('ai:deleteConversation', { id });
  },
  async restoreConversation(id: string) {
    return ipcRenderer.invoke('ai:restoreConversation', { id });
  },
  // Utilities
  async autoTagText(text: string, maxLabels?: number): Promise<{ success: true; tags: string[] }> {
    return ipcRenderer.invoke('ai:autoTagText', { text, maxLabels });
  },
  // 字幕翻译：在主进程中处理，通过 renderer-message 发送消息
  // 事件会直接发送到所有窗口，需要监听的地方直接监听 renderer-message 事件即可
  async translate(payload: {
    providerId: string;
    model: string;
    segments: Array<{ text: string; index: number }>;
    targetLanguage: string;
    languageNames: Record<string, string>;
    force?: boolean;
    metadata?: Record<string, any>;
    options?: {
      /** 最大并发请求数 */
      maxConcurrency?: number;
      /** 每个分块的最大字符数 */
      chunkSize?: number;
      /** 失败后最大重试次数 */
      maxRetries?: number;
      /** 自定义提示词模板 */
      promptTemplate?: string;
      /** 是否生成 summary */
      generateSummary?: boolean;
      /** 术语表/热词词典
       * 支持格式:
       * - 数组: Array<{ source: string; target: string; note?: string }>
       * - 对象: Record<string, string> (source -> target)
       * - 带说明的对象: Record<string, { target: string; note?: string }>
       */
      glossary?: any;
    };
  }) {
    const res = await ipcRenderer.invoke('ai:translate', payload);
    return { requestId: res.requestId as string };
  },
  async cancelTranslate(requestId: string) {
    return ipcRenderer.invoke('ai:cancelTranslate', { requestId });
  },
  async getProviderTranslationStatus(providerId: string) {
    return ipcRenderer.invoke('ai:getProviderTranslationStatus', { providerId });
  },
  async getTranslationTasks() {
    return ipcRenderer.invoke('ai:getTranslationTasks');
  },
  async getTranslatedSegments(requestId: string) {
    return ipcRenderer.invoke('ai:getTranslatedSegments', { requestId });
  }
};

export default aiBridge;
