import type { AgentContext, AgentDefinition, ChatRequest, ChatResponse } from '../types';
import { runAgentRuntimeChat } from './agent-runtime-bridge';

export const BasicAgent: AgentDefinition = {
  id: 'assistant',
  label: '对话模式',
  description: 'Direct chat with tools',
  async handleChat(ctx: AgentContext, req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    return runAgentRuntimeChat(ctx, req, req.messages || [], { agentId: 'basic', signal });
  }
};
