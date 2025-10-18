import { BrowserWindow, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { AgentDefinition, ChatRequest, StreamEvent, ChatResponse } from './types';
import { getAgent, getProvider } from './registry';
import { InstancesStore } from './instances-store';
import { getAllInstanceSecrets } from './settings-store';

// local UUID fallback if uuid not present
function safeUuid() {
  try { return randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

export class ChatService {
  private controllers = new Map<string, AbortController>();
  constructor(private win: BrowserWindow) {}

  registerIpc() {
    ipcMain.handle('ai:chat', async (_e, req: ChatRequest) => this.chat(req));
    ipcMain.handle('ai:chatStream', async (_e, req: ChatRequest & { requestId?: string }) => this.chatStream(req));
    ipcMain.handle('ai:cancel', async (_e, payload: { requestId: string }) => this.cancel(payload.requestId));
    ipcMain.handle('ai:embed', async (_e, payload: { texts: string[]; providerId?: string; model?: string; normalize?: boolean }) => this.embed(payload));
  }

  private async chat(req: ChatRequest): Promise<ChatResponse> {
    // Merge instance config if provided
    req = await this.withInstance(req);
    const agent: AgentDefinition | undefined = getAgent(req.agentId);
    const ctx = {
      window: this.win,
      emit: (_e: StreamEvent) => {},
      getProvider: (id?: string) => getProvider(id),
    };
    if (!agent) {
      const prov = getProvider(req.providerId);
      if (!prov?.chat) return { message: { role: 'assistant', content: 'No provider available.' } };
      return prov.chat({ ...req, stream: false });
    }
    return agent.handleChat(ctx, { ...req, stream: false });
  }

  private async chatStream(req: ChatRequest & { requestId?: string }) {

    console.log(req);
    
    req = await this.withInstance(req);
    const requestId = req.abortId || req['requestId'] || safeUuid();
    const eventsChannel = `ai:stream:${requestId}`;
    const ctrl = new AbortController();
    this.controllers.set(requestId, ctrl);
    const emit = (event: StreamEvent) => {
      try { this.win.webContents.send(eventsChannel, event); } catch {}
    };
    const ctx = { window: this.win, emit, getProvider: (id?: string) => getProvider(id) };
    try {
      const agent: AgentDefinition | undefined = getAgent(req.agentId);
      if (agent) {
        // Let agent orchestrate but pass emit for progressive events
        await agent.handleChat(ctx, { ...req, stream: true, abortId: requestId }, ctrl.signal);
      } else {
        const prov = getProvider(req.providerId);
        if (!prov?.chat) throw new Error('No provider available');
        await prov.chat({ ...req, stream: true, abortId: requestId }, emit, ctrl.signal);
      }
      emit({ type: 'done' });
    } catch (err: any) {
      emit({ type: 'error', data: { message: err?.message || 'chat error' } });
    } finally {
      this.controllers.delete(requestId);
    }
    return { requestId, eventsChannel };
  }

  private cancel(requestId: string) {
    const c = this.controllers.get(requestId);
    if (c) c.abort();
    this.controllers.delete(requestId);
    return { ok: true };
  }

  private async embed(payload: { texts: string[]; providerId?: string; model?: string; normalize?: boolean }) {
    const prov = getProvider(payload.providerId);
    if (!prov?.embed) throw new Error('Provider has no embeddings');
    return prov.embed(payload);
  }

  private async withInstance(req: ChatRequest): Promise<ChatRequest> {
    const instId = (req as any).providerInstanceId as string | undefined;
    if (!instId) return req;
    const inst = InstancesStore.get(instId);
    if (!inst) return req;
    // Merge instance fields
    const extras = { ...(req.extras || {}) } as any;
    if (inst.model && !extras.model) extras.model = inst.model;
    // Load secrets for this instance to allow provider overrides
    try {
      const schema = getProvider(inst.providerId)?.getConfigSchema?.();
      const keys = (schema?.fields || []).map(f => f.key);
      const secrets = await getAllInstanceSecrets(instId, keys);
      if (Object.keys(secrets).length) extras.secrets = secrets;
    } catch {}
    // Prepend system prompt
    const messages = [...(req.messages || [])];
    if (inst.systemPrompt) messages.unshift({ role: 'system', content: inst.systemPrompt });
    return { ...req, providerId: inst.providerId, messages, extras };
  }
}
