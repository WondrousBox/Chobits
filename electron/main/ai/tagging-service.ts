import { BrowserWindow, ipcMain } from 'electron';
import { InstancesStore } from './instances-store';
import { getProvider } from './registry';
import { getAllInstanceSecrets } from './settings-store';
import { TaggerAgent } from './agents/tagger';
import { chunkText } from '../embedding/chunker';

export type BestInstance = {
  providerId: string;
  instanceId?: string;
  secrets?: Record<string, string>;
  model?: string;
};

export const TaggingService = {
  async chooseBestChatInstance(): Promise<BestInstance> {
    const all = InstancesStore.list();
    type Cand = { providerId: string; instanceId: string; updatedAt: number; weight: number; secrets?: Record<string, string>; model?: string };
    const cands: Cand[] = [];
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
      const weight = (hasAllRequired ? 100 : 10) + Math.min(50, Math.floor(((inst as any).updatedAt || 0) / 1e12));
      cands.push({
        providerId: inst.providerId,
        instanceId: inst.id,
        updatedAt: (inst as any).updatedAt || 0,
        weight,
        secrets: Object.keys(secrets).length ? secrets : undefined,
        model: (inst as any).model
      });
    }
    cands.sort((a, b) => b.weight - a.weight || b.updatedAt - a.updatedAt);
    const best = cands[0];
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
