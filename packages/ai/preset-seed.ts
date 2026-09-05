import { createPreset, listPresets, setPresetSecrets } from './preset-service';
import { listProviderDefinitions } from './providers/service';
import type { ProviderPresetRecord } from './types';

// 新装用户种子的内置自托管 provider 与其默认 preset 名称
const SEED_PROVIDER_IDS = ['vllm', 'gpt-sovits'] as const;
const SEED_PRESET_NAME = '默认（自托管）';

/**
 * 为内置自托管 provider 种子一条默认 preset，让新装用户首开聊天/说话即有可用配置（免配置 API Key）。
 * 幂等：provider 维度独立判定，只要已存在任意一条该 provider 的 preset（含用户手工创建/导入的）就跳过。
 * 结构与设置页手工创建的同构：preset 记录 + secrets 存储（apiKey 等敏感字段不明文落入 preset 记录）。
 */
export async function seedDefaultProviderPreset(): Promise<ProviderPresetRecord[]> {
  const seeded: ProviderPresetRecord[] = [];
  for (const providerId of SEED_PROVIDER_IDS) {
    const definition = listProviderDefinitions().find((item) => item.id === providerId);
    const defaultConfig = definition?.defaults?.config;
    if (!defaultConfig) {
      continue;
    }

    if (listPresets(providerId).length > 0) {
      continue;
    }

    const preset = createPreset({ providerId, name: SEED_PRESET_NAME, overrides: {} });
    await setPresetSecrets(preset.id, { ...defaultConfig });
    seeded.push(preset);
  }
  return seeded;
}
