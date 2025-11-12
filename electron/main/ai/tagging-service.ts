import { BrowserWindow, ipcMain } from 'electron';

import { chunkText } from '../embedding/chunker';
import { TaggerAgent } from './agents/tagger';
import { InstancesStore } from './instances-store';
import { getProvider } from './registry';
import { isFreeProvider, loadSelectionStrategy, scoreCandidate } from './selection-strategy';
import { getAllInstanceSecrets } from './settings-store';

export type BestInstance = {
  providerId: string;
  instanceId?: string;
  secrets?: Record<string, string>;
  model?: string;
};

type Candidate = { providerId: string; instanceId: string; updatedAt: number; weight: number; secrets?: Record<string, string>; model?: string };

export const TaggingService = {
  /**
   * 自动选择“最佳聊天实例”的原则说明：
   * 1) 仅考虑已注册且实现了 chat() 能力的 Provider 对应的实例；
   * 2) 若该 Provider 的配置 schema 有必填字段，则优先那些“已配置齐所有必填秘钥”的实例；
   * 3) 结合最近更新时间（updatedAt）给予轻微加权；
   * 4) 最终按权重与最近更新时间降序排序，取第一名；
   * 5) 若没有可用实例，则回退到可聊天的 Provider（优先 ollama，再退到第一个可用 Provider）。
   *
   * 同时支持通过用户可编辑的 JSON（位于 userData/ai-selection-strategy.json）预设偏好：
   * - preferredProviders: 按顺序的偏好 Provider 列表（越靠前加分越多）
   * - freeProviders: 认为“免费/本地”的 Provider 列表（如 ollama）
   * - providerWeights / modelWeights: 针对特定 Provider/Model 的微调权重
   * - boosts.recentHalfLifeHours / recentBase: 控制“最近使用”加分的衰减
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
      // 基础权重：是否齐全 + 非线性微弱“时间”项（兼容旧逻辑）
      let weight = (hasAllRequired ? 100 : 10) + Math.min(50, Math.floor(((inst as any).updatedAt || 0) / 1e12));
      // 若启用了“仅免费”模式，则非免费 Provider 直接跳过
      if (strategy.flags?.freeOnly && !isFreeProvider(inst.providerId, strategy)) continue;
      // 应用用户策略加权（偏好、免费、Provider/Model 定制、最近使用衰减等）
      weight += scoreCandidate(
        {
          providerId: inst.providerId,
          model: (inst as any).model,
          updatedAt: (inst as any).updatedAt || 0,
          hasAllRequired
        },
        strategy
      );
      candidates.push({
        providerId: inst.providerId,
        instanceId: inst.id,
        updatedAt: (inst as any).updatedAt || 0,
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

  async autoTagText(text: string, opts?: { maxLabels?: number }): Promise<string[]> {
    const textStr = (text || '').trim();
    if (!textStr) return [];
    const best = await this.chooseBestChatInstance();
    const provider = getProvider(best.providerId);
    if (!provider || typeof (provider as any).chat !== 'function') return [];

    // Chunk long text for better tagging
    let segments = [textStr];
    try {
      const chunks = chunkText(textStr);
      if (Array.isArray(chunks) && chunks.length) segments = chunks.map((c) => c.content);
    } catch {
      // ignore chunking errors
    }

    // Use TaggerAgent directly
    const ctx = { window: undefined as BrowserWindow | undefined, emit: undefined as any, getProvider: (id?: string) => getProvider(id) };
    const req: any = {
      providerId: best.providerId,
      agentId: 'tagger',
      messages: [{ role: 'user', content: textStr }],
      stream: false,
      extras: {
        segments,
        maxLabels: Math.max(1, Math.min(50, Number(opts?.maxLabels) || 8)),
        ...(best.model ? { model: best.model } : {}),
        ...(best.secrets ? { secrets: best.secrets } : {})
      }
    };
    try {
      const resp = await TaggerAgent.handleChat(ctx as any, req);
      const tags = (resp?.message as any)?.metadata?.tags || safeParseJson((resp?.message as any)?.content)?.tags || [];
      return Array.isArray(tags) ? tags : [];
    } catch {
      return [];
    }
  },

  registerIpc(): void {
    ipcMain.handle('ai:autoTagText', async (_e, payload: { text: string; maxLabels?: number }) => {
      const tags = await this.autoTagText(payload?.text || '', { maxLabels: payload?.maxLabels });
      return { success: true, tags };
    });
  }
};

function safeParseJson(txt?: string): any {
  try {
    return txt ? JSON.parse(txt) : null;
  } catch {
    return null;
  }
}
