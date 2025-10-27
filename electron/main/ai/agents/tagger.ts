import { AgentDefinition, AgentContext, ChatRequest, ChatResponse } from '../types';

// Basic tag cleanup/normalization
function normalize(tag: string): string {
  return (tag || '')
    .trim()
    .replace(/^[-#@\s]+|[-#@\s]+$/g, '')
    .replace(/[\p{P}\p{S}]+/gu, '')
    .toLowerCase();
}

function uniqPush(map: Map<string, { label: string; score: number }>, t: string, weight = 1): void {
  const clean = t.trim();
  if (!clean) return;
  const key = normalize(clean);
  if (!key) return;
  const prev = map.get(key);
  if (prev) prev.score += weight;
  else map.set(key, { label: clean, score: weight });
}

function parseTagsFromText(txt: string): string[] {
  try {
    const json: any = JSON.parse(txt);
    if (Array.isArray(json))
      return json
        .map((v: any) => String(v))
        .map((s: string) => s.trim())
        .filter(Boolean);
    if (json && Array.isArray(json.tags))
      return json.tags
        .map((v: any) => String(v))
        .map((s: string) => s.trim())
        .filter(Boolean);
  } catch {
    // Ignore
  }
  // Fallback: split by commas/newlines
  return (txt || '')
    .split(/[\n,、，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

async function tagOneSegment(ctx: AgentContext, req: ChatRequest, seg: string, maxPerSeg = 5, signal?: AbortSignal): Promise<string[]> {
  const provider = ctx.getProvider(req.providerId);
  if (!provider?.chat) return [];
  const sys = {
    role: 'system' as const,
    content: [
      '你是一个资深文本归纳与主题提取助手。',
      '目标：从给定文本中提炼出主题/话题标签，尽量短小、泛化，避免冗长描述，控制在一个单词或者短语内。',
      `最多返回 ${maxPerSeg} 个中文标签，按相关性降序。`,
      '仅返回 JSON 数组，例如：["标签1","标签2"...]；不要包含解释性文字。'
    ].join('\n')
  };
  const user = { role: 'user' as const, content: `文本：\n${seg}` };
  try {
    const resp = await provider.chat({ ...req, messages: [sys, user], stream: false }, ctx.emit, signal);

    console.log(resp);

    const txt = resp?.message?.content || '';
    return parseTagsFromText(txt).slice(0, maxPerSeg);
  } catch {
    return [];
  }
}

export const TaggerAgent: AgentDefinition = {
  id: 'tagger',
  label: '总结打标',
  description: '对长文本进行分段处理，逐段提取标签并合并为主题标签集',
  async handleChat(ctx: AgentContext, req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const extras = req.extras || {};
    const segments: string[] = Array.isArray(extras.segments) ? (extras.segments as string[]) : [(req.messages?.[req.messages.length - 1]?.content || '').trim()].filter(Boolean);
    const maxLabels = Math.max(1, Math.min(50, Number(extras.maxLabels) || 5));
    const maxPerSeg = Math.max(1, Math.min(maxLabels, Number(extras.maxPerSeg) || 5));
    const startIndex = Math.max(0, Number(extras.startIndex) || 0);
    const initialAgg = extras.initialAgg && typeof extras.initialAgg === 'object' ? (extras.initialAgg as Record<string, number>) : {};

    // Rehydrate aggregator
    const agg = new Map<string, { label: string; score: number }>();
    for (const [k, v] of Object.entries(initialAgg)) {
      if (!k) continue;
      agg.set(normalize(k), { label: k, score: Number(v) || 0 });
    }

    const total = segments.length;
    let current = startIndex;

    // Emit initial progress
    ctx.emit?.({ type: 'metadata', data: { phase: 'start', total, startIndex, maxLabels } });

    for (; current < total; current++) {
      if (signal?.aborted) break;
      const seg = (segments[current] || '').trim();
      if (!seg) continue;
      const tags = await tagOneSegment(ctx, req, seg, maxPerSeg, signal);
      // Weight: later segments equal weight; can be tuned (e.g., tf-idf like)
      for (const t of tags) uniqPush(agg, t, 1);
      // Emit progress tick
      const topPreview = Array.from(agg.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, maxLabels)
        .map((x) => x.label);
      ctx.emit?.({ type: 'metadata', data: { phase: 'progress', index: current, total, segmentTags: tags, aggTop: topPreview } });
    }

    // Finalize
    const finalTags = Array.from(agg.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxLabels)
      .map((x) => x.label);

    const message = {
      role: 'assistant' as const,
      content: JSON.stringify({ tags: finalTags, processed: current - startIndex, total }),
      metadata: { tags: finalTags, total, processed: current, startIndex },
      createdAt: Date.now()
    };

    return { message, agentId: 'tagger' };
  }
};
