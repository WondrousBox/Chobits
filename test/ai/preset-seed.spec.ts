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

function writeExistingVllmPreset(userDataDir: string): void {
  const configDir = path.join(userDataDir, 'data');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    path.join(configDir, 'ai-provider-presets.json'),
    JSON.stringify(
      {
        presets: [
          {
            id: 'preset-existing-vllm',
            providerId: 'vllm',
            name: '我的 vLLM',
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
  it('seeds a default vllm preset with built-in server config when no preset exists', async () => {
    const seeded = await seedDefaultProviderPreset();

    expect(seeded).toMatchObject({
      providerId: 'vllm',
      name: '默认（自托管）'
    });

    const presets = listPresets('vllm');
    expect(presets).toHaveLength(1);
    expect(presets[0].id).toBe(seeded!.id);
    // 敏感字段不明文落入 preset 记录
    expect(JSON.stringify(presets[0])).not.toContain(String(vllmDefinition.defaults.config?.apiKey));

    // 内置默认服务器配置写入 preset secrets，与设置页手工创建的同构
    const secrets = await getPresetSecrets(seeded!.id, ['baseUrl', 'apiKey', 'allowInsecureTls']);
    expect(secrets).toEqual(vllmDefinition.defaults.config);
  });

  it('does not seed again when a vllm preset already exists', async () => {
    writeExistingVllmPreset(electronState.userDataDir);

    const seeded = await seedDefaultProviderPreset();

    expect(seeded).toBeUndefined();
    const presets = listPresets('vllm');
    expect(presets).toHaveLength(1);
    expect(presets[0].id).toBe('preset-existing-vllm');
  });

  it('is idempotent across repeated calls', async () => {
    const first = await seedDefaultProviderPreset();
    const second = await seedDefaultProviderPreset();

    expect(first).toBeDefined();
    expect(second).toBeUndefined();
    expect(listPresets('vllm')).toHaveLength(1);
  });
});
