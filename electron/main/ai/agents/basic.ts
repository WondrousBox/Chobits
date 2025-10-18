import { AgentDefinition, AgentContext, ChatRequest, ChatResponse } from '../types';

export const BasicAgent: AgentDefinition = {
  id: 'basic',
  label: 'Basic Agent',
  description: 'Direct provider chat without tools',
  async handleChat(ctx: AgentContext, req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const provider = ctx.getProvider(req.providerId);

    console.log(provider);
    
    if (!provider?.chat) {
      return { message: { role: 'assistant', content: 'No provider or chat capability available.' } };
    }
    const resp = await provider.chat({ ...req, stream: false }, ctx.emit, signal);
    return resp;
  },
};
