import { searchVectors } from '../../common/db';
import { AgentContext, AgentDefinition, ChatRequest, ChatResponse } from '../types';

const DEFAULT_DIM = 384; // align with your local default; providers may vary

export const RAGAgent: AgentDefinition = {
  id: 'rag',
  label: 'RAG Agent',
  description: '检索增强生成：向量检索 + 对话生成',
  async handleChat(ctx: AgentContext, req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const provider = ctx.getProvider(req.providerId);
    if (!provider?.chat) return { message: { role: 'assistant', content: 'No provider available for chat.' } };
    // 1) Embed last user query
    const last = req.messages[req.messages.length - 1];
    const query = last?.content || '';
    const topK = (req.extras?.k as number) || 5;
    let dim = (req.extras?.dim as number) || DEFAULT_DIM;
    let context = '';
    try {
      if (provider.embed) {
        const emb = await provider.embed({ texts: [query] });
        dim = emb.dim || dim;
        const results = searchVectors(emb.vectors[0], topK, dim);
        context = results.map((r, i) => `#${i + 1}: ${r.content}`).join('\n\n');
      }
    } catch {
      //
    }
    // 2) Synthesize
    const sys = { role: 'system' as const, content: '你是一个严谨的助手。优先使用“检索上下文”信息回答。如果上下文缺失，请明确说明。' };
    const ctxMsg = context ? { role: 'system' as const, content: `检索上下文：\n${context}` } : null;
    const messages = [sys, ...(ctxMsg ? [ctxMsg] : []), ...req.messages];
    const resp = await provider.chat({ ...req, messages }, ctx.emit, signal);
    return { ...resp, agentId: 'rag' };
  }
};
