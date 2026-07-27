import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => process.cwd(),
    getPath: () => os.tmpdir(),
    isPackaged: false
  },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { emit: vi.fn() }
}));
vi.mock('electron-log', () => {
  const functions = { debug: vi.fn(), error: vi.fn(), info: vi.fn(), log: vi.fn(), warn: vi.fn() };
  return {
    default: {
      functions,
      initialize: vi.fn(),
      scope: () => functions,
      transports: { console: {}, file: {} }
    }
  };
});
vi.mock('../packages/common/db', () => ({
  ResourcesRepo: {},
  WorkspacesRepo: {}
}));
vi.mock('../packages/workflow/nodes/ai-workflow-utils', () => ({
  buildWorkflowAiUsageContext: vi.fn(),
  executeWorkflowChatRequest: vi.fn(),
  executeWorkflowImageGenerationRequest: vi.fn(),
  getDynamicModelConfig: vi.fn(async () => []),
  getWorkflowProviderPresetId: vi.fn(),
  readImageAsRichContent: vi.fn()
}));
vi.mock('../packages/ocr/paddle-ocr-runtime', () => ({
  recognizeWithPaddleOcr: vi.fn()
}));

import { createEngine } from '../packages/workflow/engine';
import { EndNode } from '../packages/workflow/nodes/end';
import { ExtractKeyframesNode } from '../packages/workflow/nodes/extract-keyframes';
import { ImageGenerateNode } from '../packages/workflow/nodes/image-generate';
import { ImageUnderstandNode } from '../packages/workflow/nodes/image-understand';
import { PaddleOCRNode } from '../packages/workflow/nodes/paddle-ocr';
import { ResourceCreateNode } from '../packages/workflow/nodes/resource-create';
import { ResourceLoadNode } from '../packages/workflow/nodes/resource-load';
import { ResourceUpdateNode } from '../packages/workflow/nodes/resource-update';
import { StartNode } from '../packages/workflow/nodes/start';
import { TranscodeNode } from '../packages/workflow/nodes/transcode';
import { TranscribeFastWhisperNode } from '../packages/workflow/nodes/transcribe-fast-whisper';
import { TranscribeFunASRNode } from '../packages/workflow/nodes/transcribe-funasr';
import { TranscribeParakeetNode } from '../packages/workflow/nodes/transcribe-parakeet';
import { TranscribeWhisperNode } from '../packages/workflow/nodes/transcribe-whisper';
import { registerNode } from '../packages/workflow/registry';
import type { WorkflowDefinition } from '../packages/workflow/types';

const presetNodes = [
  StartNode,
  EndNode,
  ResourceLoadNode,
  ResourceCreateNode,
  ResourceUpdateNode,
  TranscodeNode,
  TranscribeWhisperNode,
  TranscribeFastWhisperNode,
  TranscribeParakeetNode,
  TranscribeFunASRNode,
  ExtractKeyframesNode,
  PaddleOCRNode,
  ImageUnderstandNode,
  ImageGenerateNode
];
presetNodes.forEach(registerNode);

describe('workflow presets', () => {
  it('keeps every bundled preset structurally valid', async () => {
    const presetPath = path.join(process.cwd(), 'resources', 'workflows', 'preset.json');
    const definitions = JSON.parse(readFileSync(presetPath, 'utf8')) as WorkflowDefinition[];
    const engine = createEngine({});

    for (const definition of definitions) {
      const result = await engine.validate(definition, { checkRuntimeDependencies: false });
      expect(result, `${definition.id}: ${(result.errors || []).join('; ')}`).toEqual({ ok: true });
    }
  });
});
