import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { chatRequestMock, imageRequestMock, musicRequestMock, textRequestMock } = vi.hoisted(() => ({
  chatRequestMock: vi.fn(),
  imageRequestMock: vi.fn(),
  musicRequestMock: vi.fn(),
  textRequestMock: vi.fn()
}));

vi.mock('../packages/ai/providers/service', () => ({
  getProviderDefaultModels: vi.fn(() => ({ musicGeneration: 'music-model' })),
  toCanonicalProviderId: vi.fn((providerId: string) => providerId)
}));

vi.mock('../packages/workflow-integrations/src/nodes/ai/ai-workflow-utils', () => ({
  buildWorkflowAiUsageContext: vi.fn(() => ({ operationKey: 'test', usageStage: 'generate' })),
  executeWorkflowChatRequest: chatRequestMock,
  executeWorkflowImageGenerationRequest: imageRequestMock,
  executeWorkflowMusicGenerationRequest: musicRequestMock,
  executeWorkflowTextRequest: textRequestMock,
  getDynamicModelConfig: vi.fn(async () => []),
  getWorkflowProviderPresetId: vi.fn(),
  readImageAsRichContent: vi.fn(() => ({ data: 'image', mimeType: 'image/png', type: 'image' }))
}));

import { AiChatNode } from '../packages/workflow/nodes/ai-chat';
import { AiPromptOptimizerNode } from '../packages/workflow/nodes/ai-prompt-optimizer';
import { ImageGenerateNode } from '../packages/workflow/nodes/image-generate';
import { ImageUnderstandNode } from '../packages/workflow/nodes/image-understand';
import { MusicGenerateNode } from '../packages/workflow/nodes/music-generate';
import { createWorkflowCapabilities } from '../packages/workflow/src/runtime/capabilities';
import type { ExecutionContext } from '../packages/workflow/types';
import { createWorkflowIntegrationAiCapability } from '../packages/workflow-integrations/src/adapters/ai';
import { WORKFLOW_AI } from '../packages/workflow-integrations/src/capabilities/ai';

const tempDirs: string[] = [];
const getPlugin = (): undefined => undefined;

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => fsPromises.rm(directory, { force: true, recursive: true })));
});

describe('workflow AI node cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    textRequestMock.mockResolvedValue({ runtime: 'pi', text: 'text result' });
    chatRequestMock.mockResolvedValue({ runtime: 'pi', text: '{"contentText":"","description":"image result","tags":[]}' });
    imageRequestMock.mockResolvedValue({ imageUrl: 'https://example.com/image.png' });
    musicRequestMock.mockResolvedValue({
      artifacts: [{ audioUrl: 'https://example.com/music.mp3' }],
      model: 'music-model',
      providerId: 'minimax'
    });
  });

  it('passes the execution context signal from every built-in AI node', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'workflow-ai-node-cancel-'));
    tempDirs.push(tempDir);
    const imagePath = path.join(tempDir, 'image.png');
    await fsPromises.writeFile(imagePath, 'image');
    const signal = new AbortController().signal;
    const ctx: ExecutionContext = { signal, tmpDir: tempDir };
    const emit = vi.fn();
    const capabilities = createWorkflowCapabilities([[WORKFLOW_AI, createWorkflowIntegrationAiCapability()]]);

    await AiChatNode.run({ input: { message: 'hello' }, ctx, capabilities, emit, getPlugin });
    await AiPromptOptimizerNode.run({ input: { prompt: 'improve this' }, ctx, capabilities, emit, getPlugin });
    await ImageGenerateNode.run({ input: { prompt: 'draw this' }, ctx, capabilities, emit, getPlugin });
    await ImageUnderstandNode.run({ input: { image: imagePath }, ctx, capabilities, emit, getPlugin });
    await MusicGenerateNode.run({ input: { prompt: 'make music' }, ctx, capabilities, emit, getPlugin });

    expect(textRequestMock).toHaveBeenCalledTimes(2);
    expect(textRequestMock.mock.calls.every(([options]) => options.signal === signal)).toBe(true);
    expect(chatRequestMock).toHaveBeenCalledWith(expect.objectContaining({ signal }));
    expect(imageRequestMock).toHaveBeenCalledWith(expect.objectContaining({ signal }));
    expect(musicRequestMock).toHaveBeenCalledWith(expect.objectContaining({ signal }));
  });
});
