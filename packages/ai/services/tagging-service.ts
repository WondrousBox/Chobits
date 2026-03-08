import { utils } from '@aim-packages/subtitle';
import { BrowserWindow, ipcMain } from 'electron';

import { getAgent } from '../registry';
import { getProvider } from '../registry';
import { isFreeProvider, loadSelectionStrategy, scoreCandidate } from '../selection-strategy';
import { getAllInstanceSecrets } from '../settings-store';
import { InstancesStore } from '../instances-store';

export type BestInstance = {
  providerId: string;
  instanceId?: string;
  secrets?: Record<string, string>;
  model?: string;
};

type Candidate = { providerId: string; instanceId: string; updatedAt: number; weight: number; secrets?: Record<string, string>; model?: string };

const TAGGER_SYSTEM_PROMPT = `你是一个资深文本归纳与主题提取助手。
目标：从给定文本中提炼出主题/话题标签，尽量短小、泛化，避免冗长描述，控制在一个单词或者短语内。
最多返回 5 个中文标签，按相关性降序。
仅返回 JSON 数组，例如：["标签1","标签2"...]；不要包含解释性文字`;

export const TaggingService = {
  /**
   * 自动选择"最佳聊天实例"的原则说明：
   * 1) 仅考虑已注册且实现了 chat() 能力的 Provider 对应的实例；
   * 2) 若该 Provider 的配置 schema 有必填字段，则优先那些"已配置齐所有必填秘钥"的实例；
   * 3) 结合最近更新时间（updatedAt）给予轻微加权；
   * 4) 最终按权重与最近更新时间降序排序，取第一名；
   * 5) 若没有可用实例，则回退到可聊天的 Provider（优先 ollama，再退到第一个可用 Provider）。
   *
   * 同时支持通过用户可编辑的 JSON（位于 userData/ai-selection-strategy.json）预设偏好：
   * - preferredProviders: 按顺序的偏好 Provider 列表（越靠前加分越多）
   * - freeProviders: 认为"免费/本地"的 Provider 列表（如 ollama）
   * - providerWeights / modelWeights: 针对特定 Provider/Model 的微调权重
   * - boosts.recentHalfLifeHours / recentBase: 控制"最近使用"加分的衰减
   * - flags.freeOnly: 若为 true，则仅在 freeProviders 范围内选择
   * 如未创建该文件，会自动写入一个默认模板，用户可自行修改以生效。
   */
  async chooseBestChatInstance(): Promise<BestInstance> {
    const all = InstancesStore.list();
    const candidates: Candidate[] = [];
    // 读取（并在首次缺失时生成）用户策略
    const strategy = loadSelectionStrategy();
    for (const inst of all) {
      const prov = getProvider(inst.providerId);
      if (!prov || typeof (prov as any).chat !== 'function') continue;
      const schema = prov.getConfigSchema?.();
      const fields = Array.isArray(schema?.fields) ? schema!.fields : [];
      const requiredKeys = fields.filter((f: any) => (f as any).required).map((f: any) => f.key as string);
      let secrets: Record<string, string> = {};
      try {
        secrets = await getAllInstanceSecrets(inst.id, requiredKeys.length ? requiredKeys : fields.map((f: any) => f.key));
      } catch {
        secrets = {};
      }
      const hasAllRequired = requiredKeys.length ? requiredKeys.every((k) => !!secrets[k]) : true;
      // 基础权重：是否齐全 + 非线性微弱"时间"项（兼容旧逻辑）
      let weight = (hasAllRequired ? 100 : 10) + Math.min(50, Math.floor(((inst as any).updatedAt || 1) / 1e12));
      // 若启用了"仅免费"模式，则非免费 Provider 直接跳过
      if (strategy.flags?.freeOnly && !isFreeProvider(inst.providerId, strategy)) continue;
      // 应用用户策略加权（偏好、免费、Provider/Model 定制、最近使用衰减等）
      weight += scoreCandidate(
        {
          providerId: inst.providerId,
          model: (inst as any).model,
          updatedAt: (inst as any).updatedAt || 1,
          hasAllRequired
        },
        strategy
      );
      candidates.push({
        providerId: inst.providerId,
        instanceId: inst.id,
        updatedAt: (inst as any).updatedAt || 1,
        weight,
        secrets: Object.keys(secrets).length ? secrets : undefined,
        model: (inst as any).model
      });
    }
    candidates.sort((a, b) => b.weight - a.weight || b.updatedAt - a.updatedAt);
    const best = candidates[0];
    if (best) return { providerId: best.providerId, instanceId: best.instanceId, secrets: best.secrets, model: best.model };
    // Fallbacks: pick any provider that supports chat (e.g., Ollama)
    const provFallback = getProvider('ollama') || getProvider();
    return { providerId: provFallback?.id || 'ollama' };
  },

  /**
   * 从文本中解析标签
   */
  parseTagsFromText(txt: string): string[] {
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
  },

  /**
   * 对单个文本片段提取标签
   */
  async tagOneSegment(segment: string, agent: any, signal?: AbortSignal): Promise<string[]> {
    try {
      const result = await agent.generate([
        { role: 'system', content: TAGGER_SYSTEM_PROMPT },
        { role: 'user', content: `文本：\n${segment}` }
      ], {
        maxSteps: 5,
        abortSignal: signal
      });

      const txt = result?.text || '';
      return this.parseTagsFromText(txt).slice(0, 5);
    } catch {
      return [];
    }
  },

  async autoTagText(text: string, opts?: { maxLabels?: number }): Promise<string[]> {
    const textStr = (text || '').trim();
    if (!textStr) return [];

    // 获取 Mastra Agent
    const agent = getAgent('tagger');
    if (!agent) {
      console.warn('TaggerAgent not registered');
      return [];
    }

    // Chunk long text for better tagging
    let segments = [textStr];
    try {
      const chunks = utils.chunkText(textStr);
      if (Array.isArray(chunks) && chunks.length) segments = chunks.map((c: any) => c.content);
    } catch {
      // ignore chunking errors
    }

    const maxLabels = Math.max(1, Math.min(50, Number(opts?.maxLabels) || 8));
    const maxPerSeg = 5;

    // 聚合器
    const agg = new Map<string, { label: string; score: number }>();

    const normalize = (tag: string): string => {
      return (tag || '')
        .trim()
        .replace(/^[-#@\s]+|[-#@\s]+$/g, '')
        .replace(/[\p{P}\p{S}]+/gu, '')
        .toLowerCase();
    };

    const uniqPush = (t: string, weight = 1): void => {
      const clean = t.trim();
      if (!clean) return;
      const key = normalize(clean);
      if (!key) return;
      const prev = agg.get(key);
      if (prev) prev.score += weight;
      else agg.set(key, { label: clean, score: weight });
    };

    // 处理每个片段
    for (const segment of segments) {
      const tags = await this.tagOneSegment(segment, agent);
      for (const t of tags) uniqPush(t, 1);
    }

    // 返回最终标签
    const finalTags = Array.from(agg.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxLabels)
      .map((x) => x.label);

    return finalTags;
  },

  registerIpc(): void {
    ipcMain.handle('ai:autoTagText', async (_e, payload: { text: string; maxLabels?: number }) => {
      const tags = await this.autoTagText(payload?.text || '', { maxLabels: payload?.maxLabels });
      return { success: true, tags };
    });
  }
};
