import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// plugin-config-store / resources-path 在模块加载时读取 electron app，先 mock 到临时目录
const electronState = { userDataDir: '', appPath: '' };

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: (name: string) => {
      if (name === 'userData') return electronState.userDataDir;
      if (name === 'downloads') return path.join(electronState.userDataDir, 'downloads');
      return electronState.userDataDir;
    },
    getAppPath: () => electronState.appPath
  }
}));

const tempDirs: string[] = [];

let seedBundledASRModel: typeof import('../../packages/sherpa/model-seed').seedBundledASRModel;
let BUNDLED_ASR_MODEL_NAME: string;

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeBundledModel(appPath: string): void {
  const modelDir = path.join(appPath, 'resources', 'sherpa', 'models', BUNDLED_ASR_MODEL_NAME);
  mkdirSync(modelDir, { recursive: true });
  writeFileSync(path.join(modelDir, 'model.int8.onnx'), 'fake-onnx-weights');
  writeFileSync(path.join(modelDir, 'tokens.txt'), 'fake-tokens');
}

function getTargetModelDir(): string {
  return path.join(electronState.userDataDir, 'data', 'plugins', 'sherpa-onnx', 'model', BUNDLED_ASR_MODEL_NAME);
}

beforeEach(async () => {
  // 存储路径在模块加载时定型，重置模块后在新临时目录下重新加载
  vi.resetModules();
  electronState.userDataDir = makeTempDir('sherpa-seed-userdata-');
  electronState.appPath = makeTempDir('sherpa-seed-app-');
  ({ seedBundledASRModel, BUNDLED_ASR_MODEL_NAME } = await import('../../packages/sherpa/model-seed'));
});

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('seedBundledASRModel', () => {
  it('copies the bundled model into the plugin model directory on first run', () => {
    writeBundledModel(electronState.appPath);

    expect(seedBundledASRModel()).toBe(true);

    const targetDir = getTargetModelDir();
    expect(readFileSync(path.join(targetDir, 'model.int8.onnx'), 'utf8')).toBe('fake-onnx-weights');
    expect(readFileSync(path.join(targetDir, 'tokens.txt'), 'utf8')).toBe('fake-tokens');
  });

  it('is idempotent across repeated calls', () => {
    writeBundledModel(electronState.appPath);

    expect(seedBundledASRModel()).toBe(true);
    expect(seedBundledASRModel()).toBe(false);
  });

  it('skips when the bundle does not ship the model (e.g. dev env without LFS)', () => {
    expect(seedBundledASRModel()).toBe(false);
  });
});
