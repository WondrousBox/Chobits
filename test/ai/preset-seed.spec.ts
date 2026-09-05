import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// presets-store / settings-file 在模块加载时读取 app.getPath('userData')，先 mock 到临时目录
const electronState = { userDataDir: '' };

vi.mock('electron', () => ({
  app: {
    getPath: () => electronState.userDataDir
  }
}));

import { gptSovitsDefinition } from '../../packages/ai/providers/builtins/gpt-sovits/definition';
import { vllmDefinition } from '../../packages/ai/providers/builtins/vllm/definition';

const tempDirs: string[] = [];

let seedDefaultProviderPreset: typeof import('../../packages/ai/preset-seed').seedDefaultProviderPreset;
let getPresetSecrets: typeof import('../../packages/ai/preset-service').getPresetSecrets;
let listPresets: typeof import('../../packages/ai/preset-service').listPresets;

function makeUserDataDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ai-preset-seed-test-'));
  tempDirs.push(dir);
  electronState.userDataDir = dir;
  return dir;
}

function writeExistingPreset(userDataDir: string, providerId: string): void {
  const configDir = path.join(userDataDir, 'data');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    path.join(configDir, 'ai-provider-presets.json'),
    JSON.stringify(
      {
        presets: [
          {
            id: `preset-existing-${providerId}`,
            providerId,
            name: '我的自托管服务',
            overrides: {},
            enabledTools: [],
            createdAt: 1,
            updatedAt: 1
          }
        ]
      },
      null,
      2
    ),
    'utf8'
  );
}

beforeEach(async () => {
  // 存储路径在模块加载时定型，重置模块后在新临时目录下重新加载
  vi.resetModules();
  makeUserDataDir();
  ({ seedDefaultProviderPreset } = await import('../../packages/ai/preset-seed'));
  ({ getPresetSecrets, listPresets } = await import('../../packages/ai/preset-service'));
});

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('seedDefaultProviderPreset', () => {
  it.each([
    ['vllm', vllmDefinition],
    ['gpt-sovits', gptSovitsDefinition]
  ] as const)('seeds a default %s preset with built-in server config when no preset exists', async (providerId, definition) => {
    const seeded = await seedDefaultProviderPreset();

    const preset = seeded.find((item) => item.providerId === providerId);
    expect(preset).toMatchObject({
      providerId,
      name: '默认（自托管）'
    });

    const presets = listPresets(providerId);
    expect(presets).toHaveLength(1);
    expect(presets[0].id).toBe(preset!.id);
    // 敏感字段不明文落入 preset 记录
    expect(JSON.stringify(presets[0])).not.toContain(String(definition.defaults.config?.apiKey));

    // 内置默认服务器配置写入 preset secrets，与设置页手工创建的同构
    const secrets = await getPresetSecrets(preset!.id, ['baseUrl', 'apiKey', 'allowInsecureTls']);
    expect(secrets).toEqual(definition.defaults.config);
  });

  it.each(['vllm', 'gpt-sovits'] as const)('does not seed again when a %s preset already exists', async (providerId) => {
    writeExistingPreset(electronState.userDataDir, providerId);

    const seeded = await seedDefaultProviderPreset();

    expect(seeded.find((item) => item.providerId === providerId)).toBeUndefined();
    const presets = listPresets(providerId);
    expect(presets).toHaveLength(1);
    expect(presets[0].id).toBe(`preset-existing-${providerId}`);
  });

  it('is idempotent across repeated calls', async () => {
    const first = await seedDefaultProviderPreset();
    const second = await seedDefaultProviderPreset();

    expect(first).toHaveLength(2);
    expect(second).toHaveLength(0);
    expect(listPresets('vllm')).toHaveLength(1);
    expect(listPresets('gpt-sovits')).toHaveLength(1);
  });
});
