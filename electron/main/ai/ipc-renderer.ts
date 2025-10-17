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
  async chat(payload: any) {
    return ipcRenderer.invoke('ai:chat', payload);
  },
  async chatStream(payload: any, onEvent: StreamCallback) {
    const res = await ipcRenderer.invoke('ai:chatStream', payload);
    const channel: string = res.eventsChannel;
    const listener = (_event: any, ev: any) => onEvent?.(ev);
    ipcRenderer.on(channel, listener);
    return {
      requestId: res.requestId,
      dispose: () => ipcRenderer.off(channel, listener),
      cancel: () => ipcRenderer.invoke('ai:cancel', { requestId: res.requestId }),
    };
  },
  async embed(payload: { texts: string[]; providerId?: string; model?: string; normalize?: boolean }) {
    return ipcRenderer.invoke('ai:embed', payload);
  },
  // Instances
  async listInstances(providerId?: string) { return ipcRenderer.invoke('ai:listInstances', { providerId }); },
  async createInstance(payload: { providerId: string; name: string; model?: string; systemPrompt?: string; config?: Record<string, any> }) { return ipcRenderer.invoke('ai:createInstance', payload); },
  async updateInstance(id: string, patch: any) { return ipcRenderer.invoke('ai:updateInstance', { id, patch }); },
  async deleteInstance(id: string) { return ipcRenderer.invoke('ai:deleteInstance', { id }); },
  async getInstanceSecrets(instanceId: string) { return ipcRenderer.invoke('ai:getInstanceSecrets', { instanceId }); },
  async setInstanceSecrets(instanceId: string, secrets: Record<string, string>) { return ipcRenderer.invoke('ai:setInstanceSecrets', { instanceId, secrets }); },
  // Prompt templates
  async listPromptTemplates() { return ipcRenderer.invoke('ai:listPromptTemplates'); },
  async createPromptTemplate(payload: { name: string; type: 'system'|'user'; content: string; tags?: string[] }) { return ipcRenderer.invoke('ai:createPromptTemplate', payload); },
  async updatePromptTemplate(id: string, patch: any) { return ipcRenderer.invoke('ai:updatePromptTemplate', { id, patch }); },
  async deletePromptTemplate(id: string) { return ipcRenderer.invoke('ai:deletePromptTemplate', { id }); },
};

export default aiBridge;
