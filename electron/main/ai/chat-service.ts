import { BrowserWindow, ipcMain, WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import { AgentDefinition, ChatRequest, StreamEvent, ChatResponse, EmbeddingResponse } from './types';
import { getAgent, getProvider } from './registry';
import { InstancesStore } from './instances-store';
import { getAllInstanceSecrets } from './settings-store';
import { ChatRepo } from '../db/repositories';

// local UUID fallback if uuid not present
function safeUuid(): string {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export class ChatService {
  private controllers = new Map<string, AbortController>();
  // Use defaultWin as a fallback when sender window is unavailable
  constructor(private defaultWin?: BrowserWindow) {
    //
  }

  registerIpc(): void {
    ipcMain.handle('ai:chat', async (e, req: ChatRequest) => this.chat(BrowserWindow.fromWebContents(e.sender) || this.defaultWin, req));
    ipcMain.handle('ai:chatStream', async (e, req: ChatRequest & { requestId?: string }) => this.chatStream(e.sender, req));
    ipcMain.handle('ai:chatStreamEphemeral', async (e, req: ChatRequest & { requestId?: string }) => this.chatStreamEphemeral(e.sender, req));
    ipcMain.handle('ai:cancel', async (_e, payload: { requestId: string }) => this.cancel(payload.requestId));
    ipcMain.handle('ai:embed', async (_e, payload: { texts: string[]; providerId?: string; model?: string; normalize?: boolean }) => this.embed(payload));
    // Stateless chat (no history persistence)
    ipcMain.handle('ai:chatEphemeral', async (e, req: ChatRequest) => this.chatEphemeral(BrowserWindow.fromWebContents(e.sender) || this.defaultWin, req));
  }

  private async chat(win: BrowserWindow | undefined, req: ChatRequest): Promise<ChatResponse> {
    // Merge instance config if provided
    req = await this.withInstance(req);
    // Ensure conversation and persist last user message (if any)
    const conv = await ChatRepo.ensureConversation({
      id: req.conversationId,
      agentId: req.agentId,
      providerId: req.providerId,
      providerInstanceId: (req as any).providerInstanceId
    });
    const last = (req.messages || [])
      .slice()
      .reverse()
      .find((m) => m.role === 'user');
    if (last) {
      await ChatRepo.addMessage(conv.id, {
        role: 'user',
        content: last.content,
        name: last.name,
        toolCallId: last.toolCallId,
        metadata: last.metadata ? (JSON.stringify(last.metadata) as any) : null,
        createdAt: last.createdAt || Date.now()
      } as any);
    }
    const agent: AgentDefinition | undefined = getAgent(req.agentId);
    const ctx = {
      window: win || this.defaultWin,
      getProvider: (id?: string) => getProvider(id)
    };
    if (!agent) {
      const prov = getProvider(req.providerId);
      if (!prov?.chat) return { message: { role: 'assistant', content: 'No provider available.' } };
      const resp = await prov.chat({ ...req, stream: false });
      // persist assistant reply
      await ChatRepo.addMessage(conv.id, {
        role: 'assistant',
        content: resp.message?.content || '',
        createdAt: resp.message?.createdAt || Date.now(),
        metadata: resp.metadata ? (JSON.stringify(resp.metadata) as any) : null
      } as any);
      return { ...resp, metadata: { ...(resp.metadata || {}), conversationId: conv.id } } as any;
    }
    const resp = await agent.handleChat(ctx, { ...req, stream: false });
    await ChatRepo.addMessage(conv.id, {
      role: 'assistant',
      content: resp.message?.content || '',
      createdAt: resp.message?.createdAt || Date.now(),
      metadata: resp.metadata ? (JSON.stringify(resp.metadata) as any) : null
    } as any);
    return { ...resp, metadata: { ...(resp.metadata || {}), conversationId: conv.id } } as any;
  }

  // Ephemeral chat: call provider/agent and return response without touching conversation history
  async chatEphemeral(win: BrowserWindow | undefined, req: ChatRequest): Promise<ChatResponse> {
    // Still allow instance merge (model, secrets, system prompt), but do NOT persist anything
    const resolved = await this.withInstance(req);
    const agent: AgentDefinition | undefined = getAgent(resolved.agentId);
    const ctx = {
      window: win || this.defaultWin,
      getProvider: (id?: string) => getProvider(id)
    };
    if (!agent) {
      const prov = getProvider(resolved.providerId);
      if (!prov?.chat) return { message: { role: 'assistant', content: 'No provider available.' } } as any;
      const resp = await prov.chat({ ...resolved, stream: false });
      // Ensure no conversationId is injected in metadata
      return { ...resp, metadata: { ...(resp.metadata || {}) } } as any;
    }
    const resp = await agent.handleChat(ctx, { ...resolved, stream: false });
    return { ...resp, metadata: { ...(resp.metadata || {}) } } as any;
  }

  // Streaming Ephemeral chat: stream events without persisting any history
  private async chatStreamEphemeral(sender: WebContents, req: ChatRequest & { requestId?: string }): Promise<{ requestId: string; eventsChannel: string }> {
    const requestId = req.abortId || (req as any)['requestId'] || safeUuid();
    const eventsChannel = `ai:stream:${requestId}`;
    const ctrl = new AbortController();
    this.controllers.set(requestId, ctrl);

    let emittedCompleted = false;
    const emit = (event: StreamEvent): void => {
      try {
        if (event?.type === 'message_completed') emittedCompleted = true;
        (sender || this.defaultWin?.webContents)?.send(eventsChannel, event);
      } catch { }
    };

    setTimeout(async () => {
      try {
        const resolvedReq = await this.withInstance(req);
        const ctx = { window: BrowserWindow.fromWebContents(sender) || this.defaultWin, emit, getProvider: (id?: string) => getProvider(id) };
        // Notify renderer that channel is ready
        emit({ type: 'connected' } as any);

        let finalResp: ChatResponse | undefined;
        const agent: AgentDefinition | undefined = getAgent(resolvedReq.agentId);
        if (agent) {
          finalResp = await agent.handleChat(ctx, { ...resolvedReq, stream: true, abortId: requestId }, ctrl.signal);
        } else {
          const prov = getProvider(resolvedReq.providerId);
          if (!prov?.chat) throw new Error('No provider available');
          finalResp = await prov.chat({ ...resolvedReq, stream: true, abortId: requestId }, emit, ctrl.signal);
        }
        if (!emittedCompleted && finalResp?.message) {
          emit({ type: 'message_completed', data: { message: finalResp.message } } as any);
        }
        emit({ type: 'done' });
      } catch (err: any) {
        emit({ type: 'error', data: { message: err?.message || 'chat error' } });
      } finally {
        this.controllers.delete(requestId);
      }
    }, 0);

    return { requestId, eventsChannel };
  }

  private async chatStream(sender: WebContents, req: ChatRequest & { requestId?: string }): Promise<{ requestId: string; eventsChannel: string }> {
    // Prepare identifiers and controller
    const requestId = req.abortId || req['requestId'] || safeUuid();
    const eventsChannel = `ai:stream:${requestId}`;
    const ctrl = new AbortController();
    this.controllers.set(requestId, ctrl);

    // Define emitter and context upfront
    let emittedDelta = false;
    let emittedCompleted = false;
    const emit = (event: StreamEvent) => {
      try {
        if (event?.type === 'delta' && (event as any).data?.text) emittedDelta = true;
        if (event?.type === 'message_completed') emittedCompleted = true;
        (sender || this.defaultWin?.webContents)?.send(eventsChannel, event);
      } catch { }
    };

    // Start the actual streaming on next tick to avoid missing early events
    setTimeout(async () => {
      try {
        const resolvedReq = await this.withInstance(req);
        // Ensure conversation and persist the last user message once per request
        const conv = await ChatRepo.ensureConversation({
          id: resolvedReq.conversationId,
          agentId: resolvedReq.agentId,
          providerId: resolvedReq.providerId,
          providerInstanceId: (resolvedReq as any).providerInstanceId
        });
        const last = (resolvedReq.messages || [])
          .slice()
          .reverse()
          .find((m) => m.role === 'user');
        if (last) {
          try {
            await ChatRepo.addMessage(conv.id, {
              role: 'user',
              content: last.content,
              name: last.name,
              toolCallId: last.toolCallId,
              metadata: last.metadata ? (JSON.stringify(last.metadata) as any) : null,
              createdAt: last.createdAt || Date.now()
            } as any);
          } catch { }
        }
        const ctx = { window: BrowserWindow.fromWebContents(sender) || this.defaultWin, emit, getProvider: (id?: string) => getProvider(id) };
        // Notify renderer that channel is ready (after the renderer has had a chance to attach listener)
        emit({ type: 'connected' } as any);
        emit({ type: 'metadata', data: { conversationId: conv.id } });

        let finalResp: ChatResponse | undefined;
        const agent: AgentDefinition | undefined = getAgent(resolvedReq.agentId);
        if (agent) {
          finalResp = await agent.handleChat(ctx, { ...resolvedReq, stream: true, abortId: requestId }, ctrl.signal);
        } else {
          const prov = getProvider(resolvedReq.providerId);
          if (!prov?.chat) throw new Error('No provider available');
          finalResp = await prov.chat({ ...resolvedReq, stream: true, abortId: requestId }, emit, ctrl.signal);
        }
        if (!emittedCompleted && finalResp?.message) {
          emit({ type: 'message_completed', data: { message: finalResp.message } } as any);
        }
        // Always send conversationId metadata at end as well (idempotent for renderer)
        emit({ type: 'metadata', data: { conversationId: conv.id } });
        // Persist assistant message at the end (regardless of who emitted deltas)
        try {
          const msg = finalResp?.message;
          if (msg) {
            await ChatRepo.addMessage(conv.id, {
              role: 'assistant',
              content: msg.content || '',
              name: msg.name,
              toolCallId: msg.toolCallId,
              metadata: msg.metadata ? (JSON.stringify(msg.metadata) as any) : null,
              createdAt: msg.createdAt || Date.now()
            } as any);
          }
        } catch { }
        emit({ type: 'done' });
      } catch (err: any) {
        emit({ type: 'error', data: { message: err?.message || 'chat error' } });
      } finally {
        this.controllers.delete(requestId);
      }
    }, 0);

    // Return immediately so renderer can attach listeners to eventsChannel
    return { requestId, eventsChannel };
  }

  private cancel(requestId: string): { ok: boolean } {
    const c = this.controllers.get(requestId);
    if (c) c.abort();
    this.controllers.delete(requestId);
    return { ok: true };
  }

  private async embed(payload: { texts: string[]; providerId?: string; model?: string; normalize?: boolean }): Promise<EmbeddingResponse> {
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
      const keys = (schema?.fields || []).map((f) => f.key);
      const secrets = await getAllInstanceSecrets(instId, keys);
      if (Object.keys(secrets).length) extras.secrets = secrets;
    } catch {
      //
    }
    // Prepend system prompt
    const messages = [...(req.messages || [])];
    if (inst.systemPrompt) messages.unshift({ role: 'system', content: inst.systemPrompt });
    return { ...req, providerId: inst.providerId, messages, extras };
  }
}
